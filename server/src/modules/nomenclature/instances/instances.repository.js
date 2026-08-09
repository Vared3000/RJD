import { models, sequelize } from '../../../database/models/index.js';
import { createReferenceRepository } from '../../catalogs/reference-crud.factory.js';

export const instancesRepository = createReferenceRepository(models.Instance, {
  include: [
    { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name', 'article'] },
    { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
    { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
    { model: models.Batch, as: 'batch', attributes: ['id', 'code'] },
    { model: models.Warehouse, as: 'warehouse', attributes: ['id', 'name'] },
    {
      model: models.Employee,
      as: 'employee',
      attributes: ['id', 'fullName', 'personnelNumber'],
    },
  ],
});

export const instanceRelationsRepository = {
  sequelize,

  findActive(modelName, id, { transaction } = {}) {
    return models[modelName].findOne({ where: { id, archivedAt: null }, transaction });
  },
};
