import { models } from '../../../database/models/index.js';
import { createReferenceModule } from '../reference-crud.factory.js';
import { referenceOpenApiPaths } from '../reference-openapi.js';
import { extendSwaggerPaths } from '../../../config/swagger.js';
import { ApiError } from '../../../utils/api-error.js';
import { createSubdivisionSchema, updateSubdivisionSchema } from './subdivision.validation.js';

async function validateRelations(data) {
  if (data.organizationId === undefined) return;
  const organization = await models.Organization.findOne({
    where: { id: data.organizationId, archivedAt: null },
  });
  if (!organization) {
    throw ApiError.badRequest('Указанная организация не найдена или архивирована');
  }
}

export function createSubdivisionsRouter() {
  const { router } = createReferenceModule(models.Subdivision, {
    entityName: 'Подразделение',
    viewPermission: 'catalogs.view',
    managePermission: 'catalogs.manage',
    createSchema: createSubdivisionSchema,
    updateSchema: updateSubdivisionSchema,
    validateRelations,
    include: [{ model: models.Organization, as: 'organization', attributes: ['id', 'name'] }],
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
