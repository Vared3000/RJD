import { models } from '../../../database/models/index.js';
import { createReferenceRepository } from '../reference-crud.factory.js';

export const positionRepository = createReferenceRepository(models.Position, {
  searchFields: ['name', 'code'],
  sortFields: ['name', 'code', 'createdAt'],
});
