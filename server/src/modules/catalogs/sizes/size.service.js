import { createReferenceService } from '../reference-crud.factory.js';
import { sizeRepository } from './size.repository.js';

export const sizeService = createReferenceService(sizeRepository, { entityName: 'Размер' });
