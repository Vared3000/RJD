import { sequelize } from '../../database/models/index.js';
import { adjustmentRepository } from './adjustment.repository.js';
import { ApiError } from '../../utils/api-error.js';
import { generateDocumentNumber } from './generate-document-number.js';
import { generateInventoryNumbers } from '../nomenclature/instances/generate-inventory-number.js';
import {
  buildInstanceEvent,
  instanceEventsRepository,
} from '../nomenclature/instances/instance-events.repository.js';

function assertDraft(document) {
  if (!document) throw ApiError.notFound('Документ не найден');
  if (document.status !== 'draft') {
    throw ApiError.conflict('Документ уже проведён и недоступен для изменения');
  }
}

function assertNoDuplicateLine(lines, instanceId, excludeLineId) {
  if (!instanceId) return;
  const duplicate = lines.some(
    (line) => line.id !== excludeLineId && line.instanceId === instanceId,
  );
  if (duplicate) {
    throw ApiError.badRequest('В документе уже есть строка с этим экземпляром');
  }
}

// Модель/размер проверяются так же, как при добавлении строки Поступления
// (см. receiving.service.js#normalizeLineSizes) — surplus создаёт новый
// экземпляр при проведении, поэтому его модель/размер должны быть валидны
// уже на этапе добавления строки, а не только в момент проведения.
async function assertValidModelSize(data, { transaction }) {
  const model = await adjustmentRepository.findActiveModel(data.modelId, { transaction });
  if (!model) throw ApiError.badRequest('Модель номенклатуры не найдена или архивирована');

  if (!model.sizeType) {
    return { sizeId: null, heightSizeId: null };
  }
  if (!data.sizeId) throw ApiError.badRequest('Для этой модели необходимо указать размер');
  const size = await adjustmentRepository.findActiveSize(data.sizeId, { transaction });
  if (!size || size.type !== model.sizeType) {
    throw ApiError.badRequest('Размер не найден, архивирован или не соответствует типу модели');
  }
  if (model.requiresHeightSize && !data.heightSizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать рост');
  }
  if (model.requiresHeightSize && data.heightSizeId) {
    const heightSize = await adjustmentRepository.findActiveSize(data.heightSizeId, {
      transaction,
    });
    if (!heightSize || heightSize.type !== 'height') {
      throw ApiError.badRequest('Рост не найден, архивирован или имеет другой тип');
    }
    return { sizeId: data.sizeId, heightSizeId: data.heightSizeId };
  }
  return { sizeId: data.sizeId, heightSizeId: null };
}

// Всегда собирает строку целиком по типу (а не патчит присланные поля) —
// исключает риск "прилипших" полей от предыдущего типа при правке строки
// (см. updateLine: тип менять запрещено, но защита остаётся на уровне данных).
async function buildLineRow(data, { transaction }) {
  const base = {
    adjustmentType: data.adjustmentType,
    reason: data.reason,
    note: data.note ?? null,
  };
  switch (data.adjustmentType) {
    case 'surplus': {
      const { sizeId, heightSizeId } = await assertValidModelSize(data, { transaction });
      return {
        ...base,
        instanceId: null,
        modelId: data.modelId,
        sizeId,
        heightSizeId,
        cost: data.cost ?? null,
        toWarehouseId: data.toWarehouseId,
        toCondition: data.toCondition ?? 'good',
        inventoryDocumentId: null,
      };
    }
    case 'shortage':
      return {
        ...base,
        instanceId: data.instanceId,
        modelId: null,
        sizeId: null,
        heightSizeId: null,
        cost: null,
        toWarehouseId: null,
        toCondition: null,
      };
    case 'relocate':
      return {
        ...base,
        instanceId: data.instanceId,
        modelId: null,
        sizeId: null,
        heightSizeId: null,
        cost: null,
        toWarehouseId: data.toWarehouseId,
        toCondition: null,
      };
    case 'condition':
      return {
        ...base,
        instanceId: data.instanceId,
        modelId: null,
        sizeId: null,
        heightSizeId: null,
        cost: null,
        toWarehouseId: null,
        toCondition: data.toCondition,
      };
    default:
      throw ApiError.badRequest('Неизвестный тип корректировки');
  }
}

export const adjustmentService = {
  list(options) {
    return adjustmentRepository.list(options);
  },

  async getById(id) {
    const document = await adjustmentRepository.findById(id);
    if (!document) throw ApiError.notFound('Документ не найден');
    return document;
  },

  async create(data, { userId }) {
    const number = await generateDocumentNumber();
    const document = await adjustmentRepository.createDocument({
      ...data,
      number,
      responsibleUserId: userId,
      status: 'draft',
    });
    return adjustmentRepository.findById(document.id);
  },

  // Из завершённой инвентаризации: черновик со строками shortage по каждой
  // неподтверждённой позиции снимка (docs/IMPROVEMENT_PLAN.md, задача 7).
  // Шапка и строки создаются одной транзакцией, как у самой Инвентаризации.
  async createFromInventory(inventoryDocumentId, data, { userId }) {
    const number = await generateDocumentNumber();
    let documentId;
    await sequelize.transaction(async (transaction) => {
      const inventoryDocument = await adjustmentRepository.findInventoryDocument(
        inventoryDocumentId,
        { transaction },
      );
      if (!inventoryDocument) throw ApiError.notFound('Документ инвентаризации не найден');
      if (inventoryDocument.status !== 'completed') {
        throw ApiError.badRequest(
          'Черновик корректировки можно создать только из завершённой инвентаризации',
        );
      }

      const discrepancyLines = await adjustmentRepository.findInventoryDiscrepancyLines(
        inventoryDocumentId,
        { transaction },
      );
      if (discrepancyLines.length === 0) {
        throw ApiError.badRequest('В инвентаризации нет расхождений — корректировка не требуется');
      }

      const document = await adjustmentRepository.createDocument(
        {
          number,
          warehouseId: inventoryDocument.warehouseId,
          documentDate: data.documentDate || inventoryDocument.documentDate,
          responsibleUserId: userId,
          status: 'draft',
          note: data.note ?? null,
        },
        { transaction },
      );
      documentId = document.id;

      await adjustmentRepository.bulkCreateLines(
        discrepancyLines.map((line, index) => ({
          documentId: document.id,
          adjustmentType: 'shortage',
          instanceId: line.instanceId,
          reason: `Расхождение по инвентаризации ${inventoryDocument.number}`,
          inventoryDocumentId: inventoryDocument.id,
          sortOrder: index,
        })),
        { transaction },
      );
    });
    return adjustmentRepository.findById(documentId);
  },

  async update(id, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await adjustmentRepository.findLocked(id, { transaction });
      assertDraft(document);
      await adjustmentRepository.updateDocument(id, data, { transaction });
    });
    return adjustmentRepository.findById(id);
  },

  async remove(id) {
    await sequelize.transaction(async (transaction) => {
      const document = await adjustmentRepository.findLocked(id, { transaction });
      assertDraft(document);
      await adjustmentRepository.deleteDraft(id, { transaction });
    });
  },

  async addLine(documentId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await adjustmentRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      assertNoDuplicateLine(document.lines, data.instanceId ?? null);
      const row = await buildLineRow(data, { transaction });
      await adjustmentRepository.createLine(documentId, row, { transaction });
    });
    return adjustmentRepository.findById(documentId);
  },

  async updateLine(documentId, lineId, data) {
    await sequelize.transaction(async (transaction) => {
      const document = await adjustmentRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await adjustmentRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      if (line.adjustmentType !== data.adjustmentType) {
        throw ApiError.badRequest(
          'Тип корректировки нельзя изменить — удалите строку и добавьте заново',
        );
      }
      assertNoDuplicateLine(document.lines, data.instanceId ?? null, lineId);
      const row = await buildLineRow(data, { transaction });
      await adjustmentRepository.updateLine(lineId, row, { transaction });
    });
    return adjustmentRepository.findById(documentId);
  },

  async removeLine(documentId, lineId) {
    await sequelize.transaction(async (transaction) => {
      const document = await adjustmentRepository.findLocked(documentId, { transaction });
      assertDraft(document);
      const line = await adjustmentRepository.findLine(documentId, lineId, { transaction });
      if (!line) throw ApiError.notFound('Позиция не найдена');
      await adjustmentRepository.deleteLine(lineId, { transaction });
    });
    return adjustmentRepository.findById(documentId);
  },

  // Проведение — необратимо, одна транзакция. Каждая строка (независимо от
  // типа) создаёт ровно одно движение склада и одно событие экземпляра —
  // для condition это "движение" без фактической смены склада (тот же
  // fromWarehouseId/toWarehouseId), но запись всё равно нужна как аудиторский
  // след того, что документ физически затронул экземпляр.
  async post(documentId, { userId }) {
    await sequelize.transaction(async (transaction) => {
      const document = await adjustmentRepository.findLocked(documentId, { transaction });
      if (!document) throw ApiError.notFound('Документ не найден');
      if (document.status !== 'draft') throw ApiError.conflict('Документ уже проведён');
      if (!document.lines || document.lines.length === 0) {
        throw ApiError.badRequest('В документе нет позиций — нечего проводить');
      }

      const surplusLines = document.lines.filter((line) => line.adjustmentType === 'surplus');
      const inventoryNumbers = await generateInventoryNumbers(surplusLines.length);

      const movementRows = [];
      const eventRows = [];
      let surplusCursor = 0;

      for (const line of document.lines) {
        if (line.adjustmentType === 'surplus') {
          const inventoryNumber = inventoryNumbers[surplusCursor];
          surplusCursor += 1;
          const [createdInstance] = await adjustmentRepository.bulkCreateInstances(
            [
              {
                modelId: line.modelId,
                sizeId: line.sizeId,
                heightSizeId: line.heightSizeId,
                batchId: null,
                warehouseId: line.toWarehouseId,
                inventoryNumber,
                barcode: inventoryNumber,
                status: 'in_stock',
                condition: line.toCondition || 'good',
                cost: line.cost,
              },
            ],
            { transaction },
          );
          await adjustmentRepository.updateLine(
            line.id,
            { instanceId: createdInstance.id },
            { transaction },
          );

          eventRows.push(
            buildInstanceEvent({
              instance: { id: createdInstance.id },
              eventType: 'adjustment',
              to: {
                status: 'in_stock',
                condition: line.toCondition || 'good',
                warehouseId: line.toWarehouseId,
                employeeId: null,
              },
              documentType: 'stock_adjustment',
              documentId: document.id,
              occurredAt: document.documentDate,
              userId,
              details: { documentNumber: document.number, action: 'surplus', reason: line.reason },
            }),
          );
          movementRows.push({
            instanceId: createdInstance.id,
            fromWarehouseId: null,
            toWarehouseId: line.toWarehouseId,
            documentType: 'stock_adjustment',
            documentId: document.id,
            occurredAt: document.documentDate,
            note: `Корректировка ${document.number}: излишек`,
          });
          continue;
        }

        const instance = await adjustmentRepository.findInstanceForAdjustment(line.instanceId, {
          transaction,
        });
        if (!instance) throw ApiError.notFound(`Экземпляр не найден (позиция ${line.id})`);

        if (line.adjustmentType === 'shortage') {
          if (instance.status !== 'in_stock') {
            throw ApiError.badRequest(
              `Экземпляр ${instance.inventoryNumber} сейчас не числится в наличии — корректировка неприменима`,
            );
          }
          const fromWarehouseId = instance.warehouseId;
          await adjustmentRepository.updateInstance(
            instance.id,
            { status: 'write_off', warehouseId: null, employeeId: null },
            { transaction },
          );
          eventRows.push(
            buildInstanceEvent({
              instance,
              eventType: 'adjustment',
              to: { status: 'write_off', warehouseId: null },
              documentType: 'stock_adjustment',
              documentId: document.id,
              occurredAt: document.documentDate,
              userId,
              details: { documentNumber: document.number, action: 'shortage', reason: line.reason },
            }),
          );
          movementRows.push({
            instanceId: instance.id,
            fromWarehouseId,
            toWarehouseId: null,
            documentType: 'stock_adjustment',
            documentId: document.id,
            occurredAt: document.documentDate,
            note: `Корректировка ${document.number}: недостача`,
          });
          continue;
        }

        if (line.adjustmentType === 'relocate') {
          if (instance.status !== 'in_stock') {
            throw ApiError.badRequest(
              `Экземпляр ${instance.inventoryNumber} сейчас не в наличии на складе — корректировка неприменима`,
            );
          }
          if (instance.warehouseId === line.toWarehouseId) {
            throw ApiError.badRequest(
              `Экземпляр ${instance.inventoryNumber} уже числится на указанном складе`,
            );
          }
          const fromWarehouseId = instance.warehouseId;
          await adjustmentRepository.updateInstance(
            instance.id,
            { warehouseId: line.toWarehouseId },
            { transaction },
          );
          eventRows.push(
            buildInstanceEvent({
              instance,
              eventType: 'adjustment',
              to: { warehouseId: line.toWarehouseId },
              documentType: 'stock_adjustment',
              documentId: document.id,
              occurredAt: document.documentDate,
              userId,
              details: { documentNumber: document.number, action: 'relocate', reason: line.reason },
            }),
          );
          movementRows.push({
            instanceId: instance.id,
            fromWarehouseId,
            toWarehouseId: line.toWarehouseId,
            documentType: 'stock_adjustment',
            documentId: document.id,
            occurredAt: document.documentDate,
            note: `Корректировка ${document.number}: перемещение по факту`,
          });
          continue;
        }

        // condition
        if (instance.condition === line.toCondition) {
          throw ApiError.badRequest(
            `Экземпляр ${instance.inventoryNumber} уже имеет указанное состояние`,
          );
        }
        await adjustmentRepository.updateInstance(
          instance.id,
          { condition: line.toCondition },
          { transaction },
        );
        eventRows.push(
          buildInstanceEvent({
            instance,
            eventType: 'adjustment',
            to: { condition: line.toCondition },
            documentType: 'stock_adjustment',
            documentId: document.id,
            occurredAt: document.documentDate,
            userId,
            details: { documentNumber: document.number, action: 'condition', reason: line.reason },
          }),
        );
        movementRows.push({
          instanceId: instance.id,
          fromWarehouseId: instance.warehouseId,
          toWarehouseId: instance.warehouseId,
          documentType: 'stock_adjustment',
          documentId: document.id,
          occurredAt: document.documentDate,
          note: `Корректировка ${document.number}: состояние`,
        });
      }

      await adjustmentRepository.bulkCreateMovements(movementRows, { transaction });
      await instanceEventsRepository.bulkCreate(eventRows, { transaction });
      await adjustmentRepository.markPosted(
        documentId,
        { postedByUserId: userId },
        { transaction },
      );
    });

    return adjustmentRepository.findById(documentId);
  },
};
