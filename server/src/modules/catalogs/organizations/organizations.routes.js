import { createReferenceRouter } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { createOrganizationSchema, updateOrganizationSchema } from './organization.validation.js';
import { organizationController } from './organization.controller.js';

export function createOrganizationsRouter() {
  const router = createReferenceRouter({
    controller: organizationController,
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createOrganizationSchema,
    updateSchema: updateOrganizationSchema,
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
