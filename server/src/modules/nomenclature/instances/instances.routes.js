import { models, sequelize } from '../../../database/models/index.js';
import { createReferenceModule } from '../../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { ApiError } from '../../../utils/api-error.js';
import { createInstanceSchema, updateInstanceSchema } from './instance.validation.js';
import { generateInventoryNumber } from './generate-inventory-number.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { instanceHistoryController } from './instance-history.controller.js';
import { buildInstanceEvent, instanceEventsRepository } from './instance-events.repository.js';

async function assertActiveExists(Model, id, label, { transaction } = {}) {
  const record = await Model.findOne({ where: { id, archivedAt: null }, transaction });
  if (!record) throw ApiError.badRequest(`${label} не найден(а) или архивирован(а)`);
  return record;
}

async function validateRelations(data, { current, transaction } = {}) {
  const modelId = data.modelId !== undefined ? data.modelId : current?.modelId;
  const sizeId = data.sizeId !== undefined ? data.sizeId : current?.sizeId;
  const heightSizeId = data.heightSizeId !== undefined ? data.heightSizeId : current?.heightSizeId;
  const normalized = { ...data };
  const model = modelId
    ? await assertActiveExists(models.NomenclatureModel, modelId, 'Модель номенклатуры', {
        transaction,
      })
    : null;

  if (!model?.sizeType) {
    normalized.sizeId = null;
    normalized.heightSizeId = null;
  } else {
    if (!sizeId) {
      throw ApiError.badRequest('Для этой модели необходимо указать размер');
    }
    const size = await assertActiveExists(models.Size, sizeId, 'Размер', { transaction });
    if (size.type !== model.sizeType) {
      throw ApiError.badRequest('Выбранный размер не соответствует типу размера модели');
    }
    normalized.sizeId = sizeId;
  }

  if (model?.requiresHeightSize && !heightSizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать рост');
  }
  if (model?.requiresHeightSize && heightSizeId) {
    const heightSize = await assertActiveExists(models.Size, heightSizeId, 'Рост', { transaction });
    if (heightSize.type !== 'height') {
      throw ApiError.badRequest('Рост: указан размер другого типа');
    }
    normalized.heightSizeId = heightSizeId;
  } else if (model?.sizeType) {
    normalized.heightSizeId = null;
  }
  if (data.batchId) {
    await assertActiveExists(models.Batch, data.batchId, 'Партия', { transaction });
  }
  if (data.warehouseId) {
    await assertActiveExists(models.Warehouse, data.warehouseId, 'Склад', { transaction });
  }
  return normalized;
}

async function beforeCreate(data) {
  const inventoryNumber = data.inventoryNumber || (await generateInventoryNumber());
  return { ...data, inventoryNumber, barcode: inventoryNumber };
}

export function createInstancesRouter() {
  const { router } = createReferenceModule(models.Instance, {
    entityName: 'Экземпляр',
    viewPermission: 'nomenclature.view',
    managePermission: 'nomenclature.manage',
    createSchema: createInstanceSchema,
    updateSchema: updateInstanceSchema,
    validateRelations,
    beforeCreate,
    mutationHooks: {
      sequelize,
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
    },
    include: [
      { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name', 'article'] },
      { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      { model: models.Batch, as: 'batch', attributes: ['id', 'code'] },
      { model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
      {
        model: models.Employee,
        as: 'employee',
        attributes: ['id', 'fullName', 'personnelNumber'],
      },
    ],
  });

  router.get(
    '/:id/history',
    requirePermission('nomenclature.view'),
    asyncHandler(instanceHistoryController.get),
  );

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/instances',
      tag: 'Номенклатура: Экземпляры',
      entityName: 'Экземпляр',
      requestBodyHint:
        'modelId, sizeId (обязательно), heightSizeId, batchId, warehouseId, ' +
        'inventoryNumber (авто, если не задан), status, condition, cost',
    }),
  );

  return router;
}
