import { models } from '../../../database/models/index.js';
import { createReferenceModule } from '../../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { ApiError } from '../../../utils/api-error.js';
import { createInstanceSchema, updateInstanceSchema } from './instance.validation.js';
import { generateInventoryNumber } from './generate-inventory-number.js';

async function assertActiveExists(Model, id, label) {
  const record = await Model.findOne({ where: { id, archivedAt: null } });
  if (!record) throw ApiError.badRequest(`${label} не найден(а) или архивирован(а)`);
}

async function validateRelations(data) {
  if (data.modelId !== undefined) {
    await assertActiveExists(models.NomenclatureModel, data.modelId, 'Модель номенклатуры');
  }
  if (data.sizeId !== undefined) {
    await assertActiveExists(models.Size, data.sizeId, 'Размер');
  }
  if (data.batchId) {
    await assertActiveExists(models.Batch, data.batchId, 'Партия');
  }
  if (data.warehouseId) {
    await assertActiveExists(models.Warehouse, data.warehouseId, 'Склад');
  }
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
    include: [
      { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name', 'article'] },
      { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
      { model: models.Batch, as: 'batch', attributes: ['id', 'code'] },
      { model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
    ],
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/instances',
      tag: 'Номенклатура: Экземпляры',
      entityName: 'Экземпляр',
      requestBodyHint:
        'modelId, sizeId (обязательно), batchId, warehouseId, inventoryNumber (авто, если не задан), status, condition, cost',
    }),
  );

  return router;
}
