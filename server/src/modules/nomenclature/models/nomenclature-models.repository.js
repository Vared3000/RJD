import { models } from '../../../database/models/index.js';
import { createReferenceRepository } from '../../catalogs/reference-crud.factory.js';

export const nomenclatureModelsRepository = createReferenceRepository(models.NomenclatureModel, {
  searchFields: ['name', 'article', 'description'],
  include: [
    {
      model: models.NomenclaturePrice,
      as: 'prices',
      separate: true,
      limit: 1,
      order: [
        ['effectiveDate', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      include: [{ model: models.Dpo, as: 'dpo', attributes: ['id', 'name'] }],
    },
  ],
});

export const nomenclaturePricesRepository = {
  findByModel(modelId, { dpoId } = {}) {
    return models.NomenclaturePrice.findAll({
      where: { modelId, ...(dpoId ? { dpoId } : {}) },
      include: [{ model: models.Dpo, as: 'dpo', attributes: ['id', 'name'] }],
      order: [
        ['effectiveDate', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
  },
};
