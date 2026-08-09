import { createReferenceRouter } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createSupplierSchema, updateSupplierSchema } from './supplier.validation.js';
import { supplierController } from './supplier.controller.js';

export function createSuppliersRouter() {
  const router = createReferenceRouter({
    controller: supplierController,
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createSupplierSchema,
    updateSchema: updateSupplierSchema,
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/suppliers',
      tag: 'Справочники: Поставщики',
      entityName: 'Поставщик',
      requestBodyHint:
        'name (обязательно), fullName, inn, kpp, address, contactPerson, phone, email',
    }),
  );

  return router;
}
