import { createReferenceRouter } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createSizeSchema, updateSizeSchema } from './size.validation.js';
import { sizeController } from './size.controller.js';

export function createSizesRouter() {
  const router = createReferenceRouter({
    controller: sizeController,
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createSizeSchema,
    updateSchema: updateSizeSchema,
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/sizes',
      tag: 'Справочники: Размеры',
      entityName: 'Размер',
      requestBodyHint:
        "type: 'clothing'|'height'|'shoe'|'headwear'|'belt'|'gloves' " +
        '(обязательно), value (обязательно), sortOrder',
    }),
  );

  return router;
}
