import { ApiError } from '../../../utils/api-error.js';
import { createReferenceService } from '../reference-crud.factory.js';
import { subdivisionRelationsRepository, subdivisionRepository } from './subdivision.repository.js';

async function validateRelations(data) {
  if (data.organizationId === undefined) return;
  const organization = await subdivisionRelationsRepository.findActiveOrganization(
    data.organizationId,
  );
  if (!organization) {
    throw ApiError.badRequest('Указанная организация не найдена или архивирована');
  }
}

export const subdivisionService = createReferenceService(subdivisionRepository, {
  entityName: 'Подразделение',
  validateRelations,
});
