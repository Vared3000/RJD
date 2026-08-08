import { sequelize } from '../../../database/models/index.js';
import { receivingRepository } from './receiving.repository.js';
import { ApiError } from '../../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';
import { generateInventoryNumbers } from '../../nomenclature/instances/generate-inventory-number.js';
import {
  buildInstanceEvent,
  instanceEventsRepository,
} from '../../nomenclature/instances/instance-events.repository.js';

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.conflict('Документ уже проведён и недоступен для изменения');
  }
}

function valueFrom(data, currentLine, field) {
  return Object.prototype.hasOwnProperty.call(data, field) ? data[field] : currentLine?.[field];
}

async function normalizeLineSizes(data, currentLine, { transaction } = {}) {
  const modelId = valueFrom(data, currentLine, 'modelId');
  const sizeId = valueFrom(data, currentLine, 'sizeId');
  const heightSizeId = valueFrom(data, currentLine, 'heightSizeId');
  const model = await receivingRepository.findActiveModel(modelId, { transaction });
  if (!model) throw ApiError.badRequest('Модель номенклатуры не найдена или архивирована');

  if (!model.sizeType) {
    return { ...data, sizeId: null, heightSizeId: null };
  }

  if (!sizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать размер');
  }
  const size = await receivingRepository.findActiveSize(sizeId, { transaction });
  if (!size || size.type !== model.sizeType) {
    throw ApiError.badRequest('Размер не найден, архивирован или не соответствует типу модели');
  }

  if (model.requiresHeightSize && !heightSizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать рост');
  }
  if (model.requiresHeightSize && heightSizeId) {
    const heightSize = await receivingRepository.findActiveSize(heightSizeId, { transaction });
    if (!heightSize || heightSize.type !== 'height') {
      throw ApiError.badRequest('Рост не найден, архивирован или имеет другой тип');
    }
    return { ...data, sizeId, heightSizeId };
  }

  return { ...data, sizeId, heightSizeId: null };
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
    await sequelize.transaction(async (transaction) => {
      const document = await receivingRepository.findLocked(id, { transaction });
      assertDraft(document);
      await receivingRepository.updateDocument(id, data, { transaction });
    });
    return receivingRepository.findById(id);
  },

  async remove(id) {
    await sequelize.transaction(async (transaction) => {
      const document = await receivingRepository.findLocked(id, { transaction });
      assertDraft(document);
      await receivingRepository.deleteDraft(id, { transaction });
    });
  },

  async addLine(documentId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await receivingRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const normalizedData = await normalizeLineSizes(data, null, { transaction });
      await receivingRepository.createLine(documentId, normalizedData, { transaction });
    });
    return receivingRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await receivingRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await receivingRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      const normalizedData = await normalizeLineSizes(data, line, { transaction });
      await receivingRepository.updateLine(lineId, normalizedData, { transaction });
    });
    return receivingRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    await sequelize.transaction(async (transaction) => {
      const document = await receivingRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await receivingRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      await receivingRepository.deleteLine(lineId, { transaction });
    });
    return receivingRepository.findById(documentId);
  },

  // Проведение — необратимо: создаёт партию, экземпляры (по одному на
  // единицу количества в каждой строке) и движения склада, затем закрывает
  // документ. Всё в одной транзакции с блокировкой строки документа, чтобы
  // исключить двойное проведение при параллельных запросах.
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await receivingRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.conflict('Документ уже проведён');
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
            heightSizeId: line.heightSizeId ?? null,
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
      await instanceEventsRepository.bulkCreate(
        createdInstances.map((instance) =>
          buildInstanceEvent({
            instance: { id: instance.id },
            eventType: 'receiving',
            to: {
              status: 'in_stock',
              condition: 'new',
              warehouseId: document.warehouseId,
              employeeId: null,
            },
            documentType: 'receiving',
            documentId: document.id,
            occurredAt: document.documentDate,
            userId,
            details: { documentNumber: document.number, batchId: batch.id },
          }),
        ),
        { transaction },
      );

      await receivingRepository.markPosted(
        documentId,
        { batchId: batch.id, postedByUserId: userId },
        { transaction },
      );
    });

    return receivingRepository.findById(documentId);
  },
};
