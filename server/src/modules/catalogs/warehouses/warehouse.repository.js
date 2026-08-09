import { models } from '../../../database/models/index.js';
import { createReferenceRepository } from '../reference-crud.factory.js';

export const warehouseRepository = createReferenceRepository(models.Warehouse, {
  searchFields: ['name', 'code'],
  sortFields: ['name', 'code', 'createdAt'],
  include: [{ model: models.Organization, as: 'organization', attributes: ['id', 'name'] }],
});

export const warehouseRelationsRepository = {
  findActiveOrganization(id) {
    return models.Organization.findOne({ where: { id, archivedAt: null } });
  },
};
