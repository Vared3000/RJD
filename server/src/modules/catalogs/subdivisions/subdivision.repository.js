import { models } from '../../../database/models/index.js';
import { createReferenceRepository } from '../reference-crud.factory.js';

export const subdivisionRepository = createReferenceRepository(models.Subdivision, {
  searchFields: ['name', 'code'],
  sortFields: ['name', 'code', 'createdAt'],
  include: [{ model: models.Organization, as: 'organization', attributes: ['id', 'name'] }],
});

export const subdivisionRelationsRepository = {
  findActiveOrganization(id) {
    return models.Organization.findOne({ where: { id, archivedAt: null } });
  },
};
