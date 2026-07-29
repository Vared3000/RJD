import { models } from '../../../database/models/index.js';
import { createReferenceModule } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createPositionSchema, updatePositionSchema } from './position.validation.js';

export function createPositionsRouter() {
  const { router } = createReferenceModule(models.Position, {
    entityName: 'Должность',
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createPositionSchema,
    updateSchema: updatePositionSchema,
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/positions',
      tag: 'Справочники: Должности',
      entityName: 'Должность',
      requestBodyHint: 'name (обязательно), code',
    }),
  );

  return router;
}
