import { createReferenceService } from '../reference-crud.factory.js';
import { organizationRepository } from './organization.repository.js';

export const organizationService = createReferenceService(organizationRepository, {
  entityName: 'Организация',
});
