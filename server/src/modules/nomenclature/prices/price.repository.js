import { Op } from 'sequelize';
import { models } from '../../../database/models/index.js';

function latest(where, { transaction } = {}) {
  return models.NomenclaturePrice.findOne({
    where,
    order: [
      ['effectiveDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    transaction,
  });
}

async function forScope({ modelId, dpoId, operationDate }, options) {
  const dated = await latest(
    { modelId, dpoId, effectiveDate: { [Op.lte]: operationDate } },
    options,
  );
  return dated ?? latest({ modelId, dpoId, effectiveDate: null }, options);
}

export const priceRepository = {
  async findApplicable({ modelId, dpoId, operationDate }, options = {}) {
    if (dpoId) {
      const dpoPrice = await forScope({ modelId, dpoId, operationDate }, options);
      if (dpoPrice) return dpoPrice;
    }
    return forScope({ modelId, dpoId: null, operationDate }, options);
  },
};
