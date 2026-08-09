import { ApiError } from '../../utils/api-error.js';
import { createReferenceService } from '../catalogs/reference-crud.factory.js';
import { kitRelationsRepository, kitsRepository } from './kits.repository.js';

async function assertActiveExists(modelName, id, label) {
  const record = await kitRelationsRepository.findActive(modelName, id);
  if (!record) throw ApiError.badRequest(`${label} не найден(а) или архивирован(а)`);
}

async function validateRelations(data) {
  if (data.positionId !== undefined) {
    await assertActiveExists('Position', data.positionId, 'Должность');
  }
  if (data.modelId !== undefined) {
    await assertActiveExists('NomenclatureModel', data.modelId, 'Модель');
  }
}

export const kitsService = createReferenceService(kitsRepository, {
  entityName: 'Позиция комплекта',
  validateRelations,
});
