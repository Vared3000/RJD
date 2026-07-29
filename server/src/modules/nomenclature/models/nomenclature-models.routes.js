import { models } from '../../../database/models/index.js';
import { createReferenceModule } from '../../catalogs/reference-crud.factory.js';
import { referenceOpenApiPaths } from '../../catalogs/reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import {
  createNomenclatureModelSchema,
  updateNomenclatureModelSchema,
} from './nomenclature-model.validation.js';

export function createNomenclatureModelsRouter() {
  const { router } = createReferenceModule(models.NomenclatureModel, {
    entityName: 'Модель номенклатуры',
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
      requestBodyHint: 'name (обязательно), article, unit, description',
    }),
  );

  return router;
}
