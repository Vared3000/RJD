import { models } from '../../../database/models/index.js';
import { createReferenceModule } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { ApiError } from '../../../utils/api-error.js';
import { createWarehouseSchema, updateWarehouseSchema } from './warehouse.validation.js';

async function validateRelations(data) {
  if (data.organizationId === undefined) return;
  const organization = await models.Organization.findOne({
    where: { id: data.organizationId, archivedAt: null },
  });
  if (!organization) {
    throw ApiError.badRequest('Указанная организация не найдена или архивирована');
  }
}

export function createWarehousesRouter() {
  const { router } = createReferenceModule(models.Warehouse, {
    entityName: 'Склад',
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createWarehouseSchema,
    updateSchema: updateWarehouseSchema,
    validateRelations,
    include: [{ model: models.Organization, as: 'organization', attributes: ['id', 'name'] }],
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
