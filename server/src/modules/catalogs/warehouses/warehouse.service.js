import { ApiError } from '../../../utils/api-error.js';
import { createReferenceService } from '../reference-crud.factory.js';
import { warehouseRelationsRepository, warehouseRepository } from './warehouse.repository.js';

async function validateRelations(data) {
  if (data.organizationId === undefined) return;
  const organization = await warehouseRelationsRepository.findActiveOrganization(
    data.organizationId,
  );
  if (!organization) {
    throw ApiError.badRequest('Указанная организация не найдена или архивирована');
  }
}

export const warehouseService = createReferenceService(warehouseRepository, {
  entityName: 'Склад',
  validateRelations,
});
