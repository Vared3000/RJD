import { createReferenceController } from '../reference-crud.factory.js';
import { organizationService } from './organization.service.js';

export const organizationController = createReferenceController(organizationService);
