import { models } from '../../../database/models/index.js';
import { createReferenceModule } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createOrganizationSchema, updateOrganizationSchema } from './organization.validation.js';

export function createOrganizationsRouter() {
  const { router } = createReferenceModule(models.Organization, {
    entityName: 'Организация',
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createOrganizationSchema,
    updateSchema: updateOrganizationSchema,
    searchFields: ['name', 'fullName', 'inn', 'kpp'],
    sortFields: ['name', 'fullName', 'inn', 'kpp', 'createdAt'],
  });

  extendSwaggerPaths(
    referenceOpenApiPaths({
      basePath: '/organizations',
      tag: 'Справочники: Организации',
      entityName: 'Организация',
      requestBodyHint: 'name (обязательно), fullName, inn, kpp, address, phone, email',
    }),
  );

  return router;
}
