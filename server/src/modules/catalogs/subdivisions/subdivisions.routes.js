import { createReferenceRouter } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createSubdivisionSchema, updateSubdivisionSchema } from './subdivision.validation.js';
import { subdivisionController } from './subdivision.controller.js';

export function createSubdivisionsRouter() {
  const router = createReferenceRouter({
    controller: subdivisionController,
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createSubdivisionSchema,
    updateSchema: updateSubdivisionSchema,
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/subdivisions',
      tag: 'Справочники: Подразделения',
      entityName: 'Подразделение',
      requestBodyHint: 'organizationId (обязательно), name (обязательно), code',
    }),
  );

  return router;
}
