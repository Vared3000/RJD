import { models } from '../../../database/models/index.js';

export const priceRepository = {
  async findApplicable({ modelId, operationDate }, options = {}) {
    const model = await models.NomenclatureModel.findByPk(modelId, {
      attributes: ['id', 'rentalPrice', 'rentalVatRate'],
      transaction: options.transaction,
    });
    if (model) {
      return {
        id: null,
        modelId,
        dpoId: null,
        effectiveDate: operationDate,
        priceWithoutVat: model.rentalPrice,
        vatRate: model.rentalVatRate,
        priceWithVat: null,
      };
    }
    return null;
  },
};
