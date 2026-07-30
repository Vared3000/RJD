import { models } from '../../database/models/index.js';
import { createReferenceModule } from '../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../config/swagger.js';
import { ApiError } from '../../utils/api-error.js';
import { createKitItemSchema, updateKitItemSchema } from './kit-item.validation.js';

async function assertActiveExists(Model, id, label) {
  const record = await Model.findOne({ where: { id, archivedAt: null } });
  if (!record) throw ApiError.badRequest(`${label} не найден(а) или архивирован(а)`);
  return record;
}

async function validateRelations(data) {
  if (data.positionId !== undefined) {
    await assertActiveExists(models.Position, data.positionId, 'Должность');
  }
  if (data.modelId !== undefined) {
    const model = await assertActiveExists(models.NomenclatureModel, data.modelId, 'Модель');
    if (!model.sizeType) {
      throw ApiError.badRequest(
        'У модели не указан тип размера (sizeType) — сначала укажите его в номенклатуре, ' +
          'иначе автоподбор комплекта не сможет выбрать размер работника',
      );
    }
  }
}

// Комплект по должности (раздел 9 ТЗ) — используется автоподбором в
// документе "Выдача" (Этап 8): server/src/modules/issuance/documents/.
export function createKitsRouter() {
  const { router } = createReferenceModule(models.PositionKitItem, {
    entityName: 'Позиция комплекта',
    viewPermission: 'employees.view',
    managePermission: 'employees.manage',
    createSchema: createKitItemSchema,
    updateSchema: updateKitItemSchema,
    validateRelations,
    include: [
      { model: models.Position, as: 'position', attributes: ['id', 'name'] },
      {
        model: models.NomenclatureModel,
        as: 'model',
        attributes: ['id', 'name', 'sizeType'],
      },
    ],
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/kits',
      tag: 'Работники: Комплекты по должности',
      entityName: 'Позиция комплекта',
      requestBodyHint: 'positionId, modelId (обязательно), quantity',
    }),
  );

  return router;
}
