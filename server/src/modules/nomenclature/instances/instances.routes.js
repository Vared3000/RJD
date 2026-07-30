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
  return record;
}

async function validateRelations(data, { current } = {}) {
  const modelId = data.modelId !== undefined ? data.modelId : current?.modelId;
  const sizeId = data.sizeId !== undefined ? data.sizeId : current?.sizeId;
  const heightSizeId = data.heightSizeId !== undefined ? data.heightSizeId : current?.heightSizeId;
  const normalized = { ...data };
  const model = modelId
    ? await assertActiveExists(models.NomenclatureModel, modelId, 'Модель номенклатуры')
    : null;

  if (!model?.sizeType) {
    normalized.sizeId = null;
    normalized.heightSizeId = null;
  } else {
    if (!sizeId) {
      throw ApiError.badRequest('Для этой модели необходимо указать размер');
    }
    const size = await assertActiveExists(models.Size, sizeId, 'Размер');
    if (size.type !== model.sizeType) {
      throw ApiError.badRequest('Выбранный размер не соответствует типу размера модели');
    }
    normalized.sizeId = sizeId;
  }

  if (model?.requiresHeightSize && !heightSizeId) {
    throw ApiError.badRequest('Для этой модели необходимо указать рост');
  }
  if (model?.requiresHeightSize && heightSizeId) {
    const heightSize = await assertActiveExists(models.Size, heightSizeId, 'Рост');
    if (heightSize.type !== 'height') {
      throw ApiError.badRequest('Рост: указан размер другого типа');
    }
    normalized.heightSizeId = heightSizeId;
  } else if (model?.sizeType) {
    normalized.heightSizeId = null;
  }
  if (data.batchId) {
    await assertActiveExists(models.Batch, data.batchId, 'Партия');
  }
  if (data.warehouseId) {
    await assertActiveExists(models.Warehouse, data.warehouseId, 'Склад');
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
    include: [
      { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name', 'article'] },
      { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
      { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
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
        'modelId, sizeId (обязательно), heightSizeId, batchId, warehouseId, ' +
        'inventoryNumber (авто, если не задан), status, condition, cost',
    }),
  );

  return router;
}
