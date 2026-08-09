import { createReferenceController } from '../reference-crud.factory.js';
import { supplierService } from './supplier.service.js';

export const supplierController = createReferenceController(supplierService);
