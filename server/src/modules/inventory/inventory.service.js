import { sequelize } from '../../database/models/index.js';
import { inventoryRepository } from './inventory.repository.js';
import { ApiError } from '../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.badRequest('Документ уже завершён и недоступен для изменения');
  }
}

function summarize(lines) {
  const total = lines.length;
  const confirmed = lines.filter((line) => line.confirmed).length;
  return { total, confirmed, missing: total - confirmed };
}

export const inventoryService = {
  list(options) {
    return inventoryRepository.list(options);
  },

  async getById(id) {
    const document = await inventoryRepository.findById(id);
    if (!document) throw ApiError.notFound('Документ не найден');
    return { document, summary: summarize(document.lines ?? []) };
  },

  // Создание сразу снимает снимок остатков склада (все экземпляры
  // status='in_stock' на момент создания) — физический пересчёт дальше
  // сводится к подтверждению найденных позиций (updateLine), а не к
  // ручному набору строк с нуля, как у остальных документов.
  async create(data, { userId }) {
    const number = await generateDocumentNumber();
    const document = await inventoryRepository.createDocument({
      ...data,
      number,
      responsibleUserId: userId,
      status: 'draft',
    });

    const instances = await inventoryRepository.findInStockInstances(data.warehouseId);
    if (instances.length > 0) {
      await inventoryRepository.bulkCreateLines(
        instances.map((instance, index) => ({
          documentId: document.id,
          instanceId: instance.id,
          confirmed: false,
          sortOrder: index,
        })),
      );
    }

    return inventoryService.getById(document.id);
  },

  async update(id, data) {
    const document = await inventoryRepository.findById(id);
    assertDraft(document);
    await inventoryRepository.updateDocument(id, data);
    return inventoryService.getById(id);
  },

  async remove(id) {
    const document = await inventoryRepository.findById(id);
    assertDraft(document);
    await inventoryRepository.deleteDraft(id);
  },

  async updateLine(documentId, lineId, data) {
    const document = await inventoryRepository.findById(documentId);
    assertDraft(document);
    const line = await inventoryRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    await inventoryRepository.updateLine(lineId, data);
    return inventoryService.getById(documentId);
  },

  async removeLine(documentId, lineId) {
    const document = await inventoryRepository.findById(documentId);
    assertDraft(document);
    const line = await inventoryRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    await inventoryRepository.deleteLine(lineId);
    return inventoryService.getById(documentId);
  },

  // Завершение — необратимо, но НЕ меняет остатки (раздел 11 ТЗ: изменение
  // остатков — только складским документом; сама Инвентаризация им не
  // является, это сверка). Неподтверждённые позиции остаются видны в
  // завершённом документе как расхождение — решение по ним (списание и
  // т.п.) принимается отдельным документом "Списание".
  async complete(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await inventoryRepository.findForCompletion(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.badRequest('Документ уже завершён');

      await inventoryRepository.markCompleted(
        documentId,
        { completedByUserId: userId },
        { transaction },
      );
    });

    return inventoryService.getById(documentId);
  },
};
