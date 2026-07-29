import { sequelize } from '../../../database/models/index.js';
import { receivingRepository } from './receiving.repository.js';
import { ApiError } from '../../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';
import { generateInventoryNumbers } from '../../nomenclature/instances/generate-inventory-number.js';

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.badRequest('Документ уже проведён и недоступен для изменения');
  }
}

export const receivingService = {
  list() {
    return receivingRepository.list();
  },

  async getById(id) {
    const document = await receivingRepository.findById(id);
    if (!document) throw ApiError.notFound('Документ не найден');
    return document;
  },

  async create(data, { userId }) {
    const number = await generateDocumentNumber();
    const document = await receivingRepository.createDocument({
      ...data,
      number,
      responsibleUserId: userId,
      status: 'draft',
    });
    return receivingRepository.findById(document.id);
  },

  async update(id, data) {
    const document = await receivingRepository.findById(id);
    assertDraft(document);
    await receivingRepository.updateDocument(id, data);
    return receivingRepository.findById(id);
  },

  async remove(id) {
    const document = await receivingRepository.findById(id);
    assertDraft(document);
    await receivingRepository.deleteDraft(id);
  },

  async addLine(documentId, data) {
    const document = await receivingRepository.findById(documentId);
    assertDraft(document);
    await receivingRepository.createLine(documentId, data);
    return receivingRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    const document = await receivingRepository.findById(documentId);
    assertDraft(document);
    const line = await receivingRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    await receivingRepository.updateLine(lineId, data);
    return receivingRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    const document = await receivingRepository.findById(documentId);
    assertDraft(document);
    const line = await receivingRepository.findLine(documentId, lineId);
    if (!line) throw ApiError.notFound('Позиция не найдена');
    await receivingRepository.deleteLine(lineId);
    return receivingRepository.findById(documentId);
  },

  // Проведение — необратимо: создаёт партию, экземпляры (по одному на
  // единицу количества в каждой строке) и движения склада, затем закрывает
  // документ. Всё в одной транзакции с блокировкой строки документа, чтобы
  // исключить двойное проведение при параллельных запросах.
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await receivingRepository.findForPosting(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.badRequest('Документ уже проведён');
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const batch = await receivingRepository.createBatch(
        {
          code: document.number,
          supplierId: document.supplierId,
          receivedDate: document.documentDate,
        },
        { transaction },
      );

      const totalQuantity = document.lines.reduce((sum, line) => sum + line.quantity, 0);
      const inventoryNumbers = await generateInventoryNumbers(totalQuantity);

      let cursor = 0;
      const instanceRows = [];
      for (const line of document.lines) {
        for (let i = 0; i < line.quantity; i += 1) {
          const inventoryNumber = inventoryNumbers[cursor];
          cursor += 1;
          instanceRows.push({
            modelId: line.modelId,
            sizeId: line.sizeId,
            batchId: batch.id,
            warehouseId: document.warehouseId,
            inventoryNumber,
            barcode: inventoryNumber,
            status: 'in_stock',
            condition: 'new',
            cost: line.purchasePrice,
            employeeCost: line.employeeCost,
          });
        }
      }

      const createdInstances = await receivingRepository.bulkCreateInstances(instanceRows, {
        transaction,
      });

      const movementRows = createdInstances.map((instance) => ({
        instanceId: instance.id,
        fromWarehouseId: null,
        toWarehouseId: document.warehouseId,
        documentType: 'receiving',
        documentId: document.id,
        occurredAt: document.documentDate,
        note: `Поступление ${document.number}`,
      }));
      await receivingRepository.bulkCreateMovements(movementRows, { transaction });

      await receivingRepository.markPosted(
        documentId,
        { batchId: batch.id, postedByUserId: userId },
        { transaction },
      );
    });

    return receivingRepository.findById(documentId);
  },
};
