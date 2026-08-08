import { sequelize } from '../../database/models/index.js';
import { inventoryRepository } from './inventory.repository.js';
import { ApiError } from '../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';
import {
  buildInstanceEvent,
  instanceEventsRepository,
} from '../nomenclature/instances/instance-events.repository.js';

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.conflict('Документ уже завершён и недоступен для изменения');
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
    let documentId;
    await sequelize.transaction(async (transaction) => {
      const document = await inventoryRepository.createDocument(
        {
          ...data,
          number,
          responsibleUserId: userId,
          status: 'draft',
        },
        { transaction },
      );
      documentId = document.id;

      const instances = await inventoryRepository.findInStockInstances(data.warehouseId, {
        transaction,
      });
      if (instances.length > 0) {
        await inventoryRepository.bulkCreateLines(
          instances.map((instance, index) => ({
            documentId: document.id,
            instanceId: instance.id,
            confirmed: false,
            sortOrder: index,
          })),
          { transaction },
        );
      }
    });
    return inventoryService.getById(documentId);
  },

  async update(id, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await inventoryRepository.findLocked(id, { transaction });
      assertDraft(document);
      await inventoryRepository.updateDocument(id, data, { transaction });
    });
    return inventoryService.getById(id);
  },

  async remove(id) {
    await sequelize.transaction(async (transaction) => {
      const document = await inventoryRepository.findLocked(id, { transaction });
      assertDraft(document);
      await inventoryRepository.deleteDraft(id, { transaction });
    });
  },

  async updateLine(documentId, lineId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await inventoryRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await inventoryRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      await inventoryRepository.updateLine(lineId, data, { transaction });
    });
    return inventoryService.getById(documentId);
  },

  async removeLine(documentId, lineId) {
    await sequelize.transaction(async (transaction) => {
      const document = await inventoryRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await inventoryRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      await inventoryRepository.deleteLine(lineId, { transaction });
    });
    return inventoryService.getById(documentId);
  },

  // Завершение — необратимо, но НЕ меняет остатки (раздел 11 ТЗ: изменение
  // остатков — только складским документом; сама Инвентаризация им не
  // является, это сверка). Неподтверждённые позиции остаются видны в
  // завершённом документе как расхождение — решение по ним (списание и
  // т.п.) принимается отдельным документом "Списание".
  async complete(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await inventoryRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.conflict('Документ уже завершён');

      const discrepancyLines = document.lines.filter((line) => !line.confirmed);
      if (discrepancyLines.length > 0) {
        const instances = await inventoryRepository.findInstancesByIds(
          discrepancyLines.map((line) => line.instanceId),
          { transaction },
        );
        const instancesById = new Map(instances.map((instance) => [instance.id, instance]));
        const events = discrepancyLines.flatMap((line) => {
          const instance = instancesById.get(line.instanceId);
          return instance
            ? [
                buildInstanceEvent({
                  instance,
                  eventType: 'inventory_discrepancy',
                  to: {},
                  documentType: 'inventory',
                  documentId: document.id,
                  occurredAt: document.documentDate,
                  userId,
                  details: { documentNumber: document.number, note: line.note ?? null },
                }),
              ]
            : [];
        });
        await instanceEventsRepository.bulkCreate(events, { transaction });
      }

      await inventoryRepository.markCompleted(
        documentId,
        { completedByUserId: userId },
        { transaction },
      );
    });

    return inventoryService.getById(documentId);
  },
};
