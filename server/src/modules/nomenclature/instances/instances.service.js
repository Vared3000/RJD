import { ApiError } from '../../../utils/api-error.js';
import { createReferenceService } from '../../catalogs/reference-crud.factory.js';
import { generateInventoryNumber } from './generate-inventory-number.js';
import { buildInstanceEvent, instanceEventsRepository } from './instance-events.repository.js';
import { instanceRelationsRepository, instancesRepository } from './instances.repository.js';

async function assertActiveExists(modelName, id, label, options) {
  const record = await instanceRelationsRepository.findActive(modelName, id, options);
  if (!record) throw ApiError.badRequest(`${label} не найден(а) или архивирован(а)`);
  return record;
}

async function validateRelations(data, { current, transaction } = {}) {
  const modelId = data.modelId !== undefined ? data.modelId : current?.modelId;
  const sizeId = data.sizeId !== undefined ? data.sizeId : current?.sizeId;
  const heightSizeId = data.heightSizeId !== undefined ? data.heightSizeId : current?.heightSizeId;
  const normalized = { ...data };
  const options = { transaction };
  const model = modelId
    ? await assertActiveExists('NomenclatureModel', modelId, 'Модель номенклатуры', options)
    : null;

  if (!model?.sizeType) {
    normalized.sizeId = null;
    normalized.heightSizeId = null;
  } else {
    if (!sizeId) throw ApiError.badRequest('Для этой модели необходимо указать размер');
    const size = await assertActiveExists('Size', sizeId, 'Размер', options);
    if (size.type !== model.sizeType) {
      throw ApiError.badRequest('Выбранный размер не соответствует типу размера модели');
    }
    normalized.sizeId = sizeId;
  }

  if (model?.requiresHeightSize && !heightSizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать рост');
  }
  if (model?.requiresHeightSize && heightSizeId) {
    const heightSize = await assertActiveExists('Size', heightSizeId, 'Рост', options);
    if (heightSize.type !== 'height') {
      throw ApiError.badRequest('Рост: указан размер другого типа');
    }
    normalized.heightSizeId = heightSizeId;
  } else if (model?.sizeType) {
    normalized.heightSizeId = null;
  }
  if (data.batchId) {
    await assertActiveExists('Batch', data.batchId, 'Партия', options);
  }
  if (data.warehouseId) {
    await assertActiveExists('Warehouse', data.warehouseId, 'Склад', options);
  }
  return normalized;
}

async function beforeCreate(data) {
  const inventoryNumber = data.inventoryNumber || (await generateInventoryNumber());
  return { ...data, inventoryNumber, barcode: inventoryNumber };
}

const mutationHooks = {
  sequelize: instanceRelationsRepository.sequelize,
  async afterCreate(instance, { userId, transaction }) {
    await instanceEventsRepository.bulkCreate(
      [
        {
          instanceId: instance.id,
          eventType: 'adjustment',
          fromStatus: null,
          toStatus: instance.status,
          fromCondition: null,
          toCondition: instance.condition,
          fromWarehouseId: null,
          toWarehouseId: instance.warehouseId,
          fromEmployeeId: null,
          toEmployeeId: instance.employeeId,
          occurredAt: instance.createdAt,
          userId,
          details: { action: 'manual_create' },
        },
      ],
      { transaction },
    );
  },
  async afterUpdate(current, instance, data, { userId, transaction }) {
    const changedFields = Object.keys(data).filter(
      (field) => String(current[field] ?? '') !== String(instance[field] ?? ''),
    );
    if (changedFields.length === 0) return;
    await instanceEventsRepository.bulkCreate(
      [
        buildInstanceEvent({
          instance: current,
          eventType: 'adjustment',
          to: {
            status: instance.status,
            condition: instance.condition,
            warehouseId: instance.warehouseId,
            employeeId: instance.employeeId,
          },
          userId,
          details: { action: 'manual_update', changedFields },
        }),
      ],
      { transaction },
    );
  },
};

export const instancesService = createReferenceService(instancesRepository, {
  entityName: 'Экземпляр',
  validateRelations,
  beforeCreate,
  mutationHooks,
});
