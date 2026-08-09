import { createReferenceController } from '../reference-crud.factory.js';
import { positionService } from './position.service.js';

export const positionController = createReferenceController(positionService);
