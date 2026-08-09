import { models } from '../../../database/models/index.js';
import { createReferenceRepository } from '../reference-crud.factory.js';

export const sizeRepository = createReferenceRepository(models.Size, {
  searchFields: ['value'],
  sortFields: ['value', 'type', 'sortOrder', 'createdAt'],
});
