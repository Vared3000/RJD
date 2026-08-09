import { models } from '../../../database/models/index.js';
import { createReferenceRepository } from '../reference-crud.factory.js';

export const organizationRepository = createReferenceRepository(models.Organization, {
  searchFields: ['name', 'fullName', 'inn', 'kpp'],
  sortFields: ['name', 'fullName', 'inn', 'kpp', 'createdAt'],
});
