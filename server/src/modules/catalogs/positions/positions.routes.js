import { createReferenceRouter } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createPositionSchema, updatePositionSchema } from './position.validation.js';
import { positionController } from './position.controller.js';

export function createPositionsRouter() {
  const router = createReferenceRouter({
    controller: positionController,
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
