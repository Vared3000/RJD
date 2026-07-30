import { sequelize } from '../../../database/models/index.js';
import { issuanceRepository } from './issuance.repository.js';
import { ApiError } from '../../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';

const SIZE_FIELD_BY_TYPE = {
  clothing: 'clothingSizeId',
  height: 'heightSizeId',
  shoe: 'shoeSizeId',
};

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.badRequest('Документ уже проведён и недоступен для изменения');
  }
}

// Дублирующая проверка перед уникальным индексом БД (см. миграцию 0027) —
// понятная ошибка вместо падения на constraint. excludeLineId — при
// редактировании существующей строки исключает её саму из сравнения.
function assertNoDuplicateLine(lines, { modelId, sizeId }, excludeLineId) {
  const duplicate = lines.some(
    (line) => line.id !== excludeLineId && line.modelId === modelId && line.sizeId === sizeId,
  );
  if (duplicate) {
    throw ApiError.badRequest(
      'В документе уже есть строка с такой же моделью и размером — измените количество в ней',
    );
  }
}

export const issuanceService = {
  list(options) {
    return issuanceRepository.list(options);
  },

  async getById(id) {
    const document = await issuanceRepository.findById(id);
    if (!document) throw ApiError.notFound('Документ не найден');
    return document;
  },

  async create(data, { userId }) {
    const number = await generateDocumentNumber();
    const document = await issuanceRepository.createDocument({
      ...data,
      number,
      responsibleUserId: userId,
      status: 'draft',
    });
    return issuanceRepository.findById(document.id);
  },

  async update(id, data) {
    const document = await issuanceRepository.findById(id);
    assertDraft(document);
    await issuanceRepository.updateDocument(id, data);
    return issuanceRepository.findById(id);
  },

  async remove(id) {
    const document = await issuanceRepository.findById(id);
    assertDraft(document);
    await issuanceRepository.deleteDraft(id);
  },

  async addLine(documentId, data) {
    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);
    assertNoDuplicateLine(document.lines, data);
    await issuanceRepository.createLine(documentId, data);
    return issuanceRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);
    const line = await issuanceRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    assertNoDuplicateLine(
      document.lines,
      { modelId: data.modelId ?? line.modelId, sizeId: data.sizeId ?? line.sizeId },
      lineId,
    );
    await issuanceRepository.updateLine(lineId, data);
    return issuanceRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);
    const line = await issuanceRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    await issuanceRepository.deleteLine(lineId);
    return issuanceRepository.findById(documentId);
  },

  // Быстрый подбор комплекта (раздел 9 ТЗ): по должности работника находит
  // комплект, по типу размера каждой модели комплекта (nomenclatureModel.
  // sizeType) берёт соответствующий размер из карточки работника. Позиции,
  // для которых у работника размер этого типа не указан, или строка с такой
  // же моделью/размером уже есть в документе — пропускаются, а не падают с
  // ошибкой (пользователь может добавить их вручную); список пропущенных
  // возвращается вызывающей стороне для отображения предупреждения.
  async applyKit(documentId) {
    const document = await issuanceRepository.findById(documentId);
    assertDraft(document);

    const { employee, kitItems } = await issuanceRepository.findEmployeeWithKit(
      document.employeeId,
    );

    const existingKeys = new Set(document.lines.map((line) => `${line.modelId}:${line.sizeId}`));
    const skipped = [];

    for (const kitItem of kitItems) {
      const sizeField = SIZE_FIELD_BY_TYPE[kitItem.model?.sizeType];
      const sizeId = sizeField ? employee[sizeField] : null;
      if (!sizeId) {
        skipped.push({
          modelId: kitItem.modelId,
          modelName: kitItem.model?.name,
          reason: 'no-size',
        });
        continue;
      }
      const key = `${kitItem.modelId}:${sizeId}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      await issuanceRepository.createLine(documentId, {
        modelId: kitItem.modelId,
        sizeId,
        quantity: kitItem.quantity,
      });
    }

    return { document: await issuanceRepository.findById(documentId), skipped };
  },

  // Проведение — необратимо: подбирает под каждую строку доступные экземпляры
  // (FIFO по дате поступления, FOR UPDATE SKIP LOCKED — см. репозиторий),
  // переводит их в issued с привязкой к работнику и создаёт движения склада.
  // Если хотя бы по одной строке не хватает остатка — вся транзакция
  // откатывается, документ остаётся черновиком.
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await issuanceRepository.findForPosting(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.badRequest('Документ уже проведён');
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const allInstanceIds = [];
      const movementRows = [];

      for (const line of document.lines) {
        const instances = await issuanceRepository.findAvailableInstances(
          {
            modelId: line.modelId,
            sizeId: line.sizeId,
            warehouseId: document.warehouseId,
            limit: line.quantity,
          },
          { transaction },
        );

        if (instances.length < line.quantity) {
          const modelName = line.model?.name ?? line.modelId;
          const sizeValue = line.size?.value ?? line.sizeId;
          throw ApiError.badRequest(
            `Недостаточно на складе: «${modelName}», размер ${sizeValue} — ` +
              `доступно ${instances.length} из ${line.quantity}`,
          );
        }

        for (const instance of instances) {
          allInstanceIds.push(instance.id);
          movementRows.push({
            instanceId: instance.id,
            fromWarehouseId: document.warehouseId,
            toWarehouseId: null,
            documentType: 'issuance',
            documentId: document.id,
            occurredAt: document.documentDate,
            note: `Выдача ${document.number}`,
          });
        }
      }

      await issuanceRepository.markInstancesIssued(allInstanceIds, document.employeeId, {
        transaction,
      });
      await issuanceRepository.bulkCreateMovements(movementRows, { transaction });
      await issuanceRepository.markPosted(documentId, { postedByUserId: userId }, { transaction });
    });

    return issuanceRepository.findById(documentId);
  },
};
