import { createReferenceController } from '../../catalogs/reference-crud.factory.js';
import { instancesService } from './instances.service.js';

export const instancesController = createReferenceController(instancesService);
