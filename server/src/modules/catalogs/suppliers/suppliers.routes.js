import { models } from '../../../database/models/index.js';
import { createReferenceModule } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createSupplierSchema, updateSupplierSchema } from './supplier.validation.js';

export function createSuppliersRouter() {
  const { router } = createReferenceModule(models.Supplier, {
    entityName: 'Поставщик',
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createSupplierSchema,
    updateSchema: updateSupplierSchema,
    searchFields: ['name', 'fullName', 'inn', 'kpp'],
    sortFields: ['name', 'fullName', 'inn', 'kpp', 'createdAt'],
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
