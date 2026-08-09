import { models } from '../../../database/models/index.js';
import { createReferenceRepository } from '../reference-crud.factory.js';

export const supplierRepository = createReferenceRepository(models.Supplier, {
  searchFields: ['name', 'fullName', 'inn', 'kpp'],
  sortFields: ['name', 'fullName', 'inn', 'kpp', 'createdAt'],
});
