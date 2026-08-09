import { createReferenceController } from '../catalogs/reference-crud.factory.js';
import { kitsService } from './kits.service.js';

export const kitsController = createReferenceController(kitsService, {
  filterFields: ['positionId'],
});
