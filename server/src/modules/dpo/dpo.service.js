import { sequelize } from '../../database/models/index.js';
import { dpoRepository } from './dpo.repository.js';
import { ApiError } from '../../utils/api-error.js';

// Поля, для которых имеет смысл вести историю (раздел 10 ТЗ) — совпадает со
// всем набором изменяемых атрибутов ДПО, кроме архивации (у неё свой
// отдельный workflow archive/restore, не через update()).
const TRACKED_FIELDS = [
  'name',
  'fullName',
  'code',
  'address',
  'okpo',
  'businessUnitCode',
  'directorFullName',
  'directorBasis',
  'contractNumber',
  'contractDate',
  'additionalAgreementNumber',
  'additionalAgreementDate',
];

function normalize(value) {
  // DATEONLY-поля Sequelize отдаёт строкой 'YYYY-MM-DD', сравниваем как есть;
  // null/undefined считаем одним и тем же отсутствующим значением.
  return value === undefined ? null : value;
}

export const dpoService = {
  list(options) {
    return dpoRepository.list(options);
  },

  async getById(id) {
    const item = await dpoRepository.findById(id);
    if (!item) throw ApiError.notFound('ДПО не найдено');
    return item;
  },

  async create(data) {
    return dpoRepository.create(data);
  },

  async update(id, data, { userId } = {}) {
    return sequelize.transaction(async (transaction) => {
      const current = await dpoRepository.findByIdForUpdate(id, { transaction });
      if (!current) throw ApiError.notFound('ДПО не найдено или архивировано');

      const changedFields = TRACKED_FIELDS.filter(
        (field) =>
          Object.prototype.hasOwnProperty.call(data, field) &&
          normalize(data[field]) !== normalize(current[field]),
      );

      if (changedFields.length > 0) {
        const previousData = Object.fromEntries(
          changedFields.map((field) => [field, current[field]]),
        );
        await dpoRepository.createHistoryEntry(
          { dpoId: id, changedByUserId: userId ?? null, previousData },
          { transaction },
        );
      }

      const updated = await dpoRepository.updateById(id, data, { transaction });
      if (!updated) throw ApiError.notFound('ДПО не найдено или архивировано');
      return dpoRepository.findById(id, { transaction });
    });
  },

  async archive(id) {
    const ok = await dpoRepository.archive(id);
    if (!ok) throw ApiError.notFound('ДПО не найдено или уже архивировано');
  },

  async restore(id) {
    const ok = await dpoRepository.restore(id);
    if (!ok) throw ApiError.notFound('ДПО не найдено или не архивировано');
  },

  // Восстанавливает для каждой записи истории diff «было -> стало»: «было» —
  // это previousData самой записи; «стало» — значение из ближайшей более
  // поздней записи, где это же поле снова менялось, либо (если такой нет)
  // текущее значение в живой записи ДПО. Новые записи — первыми.
  async getHistory(id) {
    const current = await dpoRepository.findById(id);
    if (!current) throw ApiError.notFound('ДПО не найдено');

    const entries = await dpoRepository.listHistory(id); // asc по changedAt

    const result = entries.map((entry, index) => {
      const changes = {};
      for (const [field, fromValue] of Object.entries(entry.previousData)) {
        const later = entries
          .slice(index + 1)
          .find((next) => Object.prototype.hasOwnProperty.call(next.previousData, field));
        const toValue = later ? later.previousData[field] : current[field];
        changes[field] = { from: fromValue, to: toValue };
      }
      return {
        changedAt: entry.changedAt,
        changedByName: entry.changedBy?.fullName ?? null,
        changes,
      };
    });

    return result.reverse();
  },
};
