import { createReferenceController } from '../reference-crud.factory.js';
import { sizeService } from './size.service.js';

export const sizeController = createReferenceController(sizeService);
