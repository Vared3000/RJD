import { createReferenceController } from '../reference-crud.factory.js';
import { warehouseService } from './warehouse.service.js';

export const warehouseController = createReferenceController(warehouseService);
