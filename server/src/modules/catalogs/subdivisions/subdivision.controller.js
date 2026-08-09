import { createReferenceController } from '../reference-crud.factory.js';
import { subdivisionService } from './subdivision.service.js';

export const subdivisionController = createReferenceController(subdivisionService);
