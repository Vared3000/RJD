import { models } from '../../database/models/index.js';
import { createReferenceRepository } from '../catalogs/reference-crud.factory.js';

export const kitsRepository = createReferenceRepository(models.PositionKitItem, {
  filterFields: ['positionId'],
  include: [
    { model: models.Position, as: 'position', attributes: ['id', 'name'] },
    {
      model: models.NomenclatureModel,
      as: 'model',
      attributes: ['id', 'name', 'sizeType'],
    },
  ],
});

export const kitRelationsRepository = {
  findActive(modelName, id) {
    return models[modelName].findOne({ where: { id, archivedAt: null } });
  },
};
