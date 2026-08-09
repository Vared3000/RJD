import { createReferenceService } from '../reference-crud.factory.js';
import { positionRepository } from './position.repository.js';

export const positionService = createReferenceService(positionRepository, {
  entityName: 'Должность',
});
