import { ApiError } from '../../../utils/api-error.js';
import { printFormSettingsRepository } from './print-form-settings.repository.js';

export const printFormSettingsService = {
  list() {
    return printFormSettingsRepository.list();
  },

  create(data, { userId }) {
    const normalized = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value === '' ? null : value]),
    );
    return printFormSettingsRepository.create({ ...normalized, createdByUserId: userId });
  },

  async snapshotAt(date) {
    const [executorRecord, customerRecord] = await Promise.all([
      printFormSettingsRepository.findAt('executor', date),
      printFormSettingsRepository.findAt('customer', date),
    ]);
    if (!executorRecord || !customerRecord) {
      throw ApiError.badRequest(`Не заполнены реквизиты сторон на дату ${date}`);
    }
    return {
      executor: executorRecord.get({ plain: true }),
      customer: customerRecord.get({ plain: true }),
    };
  },
};
