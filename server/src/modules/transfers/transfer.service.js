import { sequelize } from '../../database/models/index.js';
import { transferRepository } from './transfer.repository.js';
import { ApiError } from '../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.badRequest('Документ уже проведён и недоступен для изменения');
  }
}

// Дублирующая проверка перед уникальным индексом БД — понятная ошибка
// вместо падения на constraint (см. дефект дублей строк Этапа 8).
function assertNoDuplicateLine(lines, instanceId, excludeLineId) {
  const duplicate = lines.some(
    (line) => line.id !== excludeLineId && line.instanceId === instanceId,
  );
  if (duplicate) {
    throw ApiError.badRequest('В документе уже есть строка с этим экземпляром');
  }
}

export const transferService = {
  list(options) {
    return transferRepository.list(options);
  },

  async getById(id) {
    const document = await transferRepository.findById(id);
    if (!document) throw ApiError.notFound('Документ не найден');
    return document;
  },

  async create(data, { userId }) {
    const number = await generateDocumentNumber();
    const document = await transferRepository.createDocument({
      ...data,
      number,
      responsibleUserId: userId,
      status: 'draft',
    });
    return transferRepository.findById(document.id);
  },

  async update(id, data) {
    const document = await transferRepository.findById(id);
    assertDraft(document);
    await transferRepository.updateDocument(id, data);
    return transferRepository.findById(id);
  },

  async remove(id) {
    const document = await transferRepository.findById(id);
    assertDraft(document);
    await transferRepository.deleteDraft(id);
  },

  async addLine(documentId, data) {
    const document = await transferRepository.findById(documentId);
    assertDraft(document);
    assertNoDuplicateLine(document.lines, data.instanceId);
    await transferRepository.createLine(documentId, data);
    return transferRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    const document = await transferRepository.findById(documentId);
    assertDraft(document);
    const line = await transferRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    assertNoDuplicateLine(document.lines, data.instanceId ?? line.instanceId, lineId);
    await transferRepository.updateLine(lineId, data);
    return transferRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    const document = await transferRepository.findById(documentId);
    assertDraft(document);
    const line = await transferRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    await transferRepository.deleteLine(lineId);
    return transferRepository.findById(documentId);
  },

  // Проведение — необратимо: по каждой строке проверяет, что экземпляр
  // сейчас реально в наличии (in_stock) на складе-отправителе именно
  // сейчас (лочим экземпляр, а не полагаемся на состояние на момент
  // addLine), переводит warehouseId на склад-получатель и создаёт движение
  // склада — единственный документ, где у StockMovement заполнены оба
  // склада (остальные документы всегда оставляют одно из полей null).
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await transferRepository.findForPosting(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.badRequest('Документ уже проведён');
      if (document.fromWarehouseId === document.toWarehouseId) {
        throw ApiError.badRequest('Склад-отправитель и склад-получатель не должны совпадать');
      }
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const movementRows = [];

      for (const line of document.lines) {
        const instance = await transferRepository.findInstanceForTransfer(line.instanceId, {
          transaction,
        });
        if (!instance) throw ApiError.notFound(`Экземпляр не найден (позиция ${line.id})`);
        if (instance.status !== 'in_stock' || instance.warehouseId !== document.fromWarehouseId) {
          throw ApiError.badRequest(
            `Экземпляр ${instance.inventoryNumber} сейчас не в наличии на складе-отправителе — ` +
              'проверьте позицию документа',
          );
        }

        await transferRepository.markInstanceMoved(
          instance.id,
          { warehouseId: document.toWarehouseId },
          { transaction },
        );

        movementRows.push({
          instanceId: instance.id,
          fromWarehouseId: document.fromWarehouseId,
          toWarehouseId: document.toWarehouseId,
          documentType: 'transfer',
          documentId: document.id,
          occurredAt: document.documentDate,
          note: `Перемещение ${document.number}`,
        });
      }

      await transferRepository.bulkCreateMovements(movementRows, { transaction });
      await transferRepository.markPosted(documentId, { postedByUserId: userId }, { transaction });
    });

    return transferRepository.findById(documentId);
  },
};
