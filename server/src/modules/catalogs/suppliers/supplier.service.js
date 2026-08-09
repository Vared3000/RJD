import { createReferenceService } from '../reference-crud.factory.js';
import { supplierRepository } from './supplier.repository.js';

export const supplierService = createReferenceService(supplierRepository, {
  entityName: 'Поставщик',
});
