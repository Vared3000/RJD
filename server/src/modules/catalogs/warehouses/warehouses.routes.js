import { createReferenceRouter } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createWarehouseSchema, updateWarehouseSchema } from './warehouse.validation.js';
import { warehouseController } from './warehouse.controller.js';

export function createWarehousesRouter() {
  const router = createReferenceRouter({
    controller: warehouseController,
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createWarehouseSchema,
    updateSchema: updateWarehouseSchema,
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/warehouses',
      tag: 'Справочники: Склады',
      entityName: 'Склад',
      requestBodyHint: 'organizationId (обязательно), name (обязательно), code, address',
    }),
  );

  return router;
}
