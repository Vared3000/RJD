import { createReferenceRouter } from '../../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import {
  createNomenclatureModelSchema,
  updateNomenclatureModelSchema,
} from './nomenclature-model.validation.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { nomenclatureModelsController } from './nomenclature-models.controller.js';

export function createNomenclatureModelsRouter() {
  const router = createReferenceRouter({
    controller: nomenclatureModelsController,
    viewPermission: 'nomenclature.view',
    managePermission: 'nomenclature.manage',
    createSchema: createNomenclatureModelSchema,
    updateSchema: updateNomenclatureModelSchema,
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/nomenclature-models',
      tag: 'Номенклатура: Модели',
      entityName: 'Модель номенклатуры',
      requestBodyHint:
        'name (обязательно), unit, sizeType, genderCategory, wearMonths (массив чисел 1–12)',
    }),
  );

  router.get(
    '/:id/prices',
    requirePermission('nomenclature.view'),
    asyncHandler(nomenclatureModelsController.listPrices),
  );

  return router;
}
