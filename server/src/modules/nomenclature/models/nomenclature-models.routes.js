import { models } from '../../../database/models/index.js';
import { createReferenceModule } from '../../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import {
  createNomenclatureModelSchema,
  updateNomenclatureModelSchema,
} from './nomenclature-model.validation.js';
import { ApiError } from '../../../utils/api-error.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { success } from '../../../utils/respond.js';

async function validateRelations(data, { current } = {}) {
  const sizeType = data.sizeType !== undefined ? data.sizeType : current?.sizeType;
  const requiresHeightSize =
    data.requiresHeightSize !== undefined
      ? data.requiresHeightSize
      : (current?.requiresHeightSize ?? false);
  if (requiresHeightSize && sizeType !== 'clothing') {
    throw ApiError.badRequest('Рост можно требовать только для моделей с типом размера «Одежда»');
  }
}

export function createNomenclatureModelsRouter() {
  const { router } = createReferenceModule(models.NomenclatureModel, {
    entityName: 'Модель номенклатуры',
    viewPermission: 'nomenclature.view',
    managePermission: 'nomenclature.manage',
    createSchema: createNomenclatureModelSchema,
    updateSchema: updateNomenclatureModelSchema,
    validateRelations,
    include: [
      {
        model: models.NomenclaturePrice,
        as: 'prices',
        separate: true,
        limit: 1,
        order: [
          ['effectiveDate', 'DESC'],
          ['createdAt', 'DESC'],
        ],
        include: [{ model: models.Dpo, as: 'dpo', attributes: ['id', 'name'] }],
      },
    ],
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/nomenclature-models',
      tag: 'Номенклатура: Модели',
      entityName: 'Модель номенклатуры',
      requestBodyHint: 'name (обязательно), article, unit, description',
    }),
  );

  router.get(
    '/:id/prices',
    requirePermission('nomenclature.view'),
    asyncHandler(async (req, res) => {
      const prices = await models.NomenclaturePrice.findAll({
        where: {
          modelId: req.params.id,
          ...(req.query.dpoId ? { dpoId: req.query.dpoId } : {}),
        },
        include: [{ model: models.Dpo, as: 'dpo', attributes: ['id', 'name'] }],
        order: [
          ['effectiveDate', 'DESC'],
          ['createdAt', 'DESC'],
        ],
      });
      return success(res, prices);
    }),
  );

  return router;
}
