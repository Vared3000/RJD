import { createReferenceController } from '../../catalogs/reference-crud.factory.js';
import { success } from '../../../utils/respond.js';
import { nomenclatureModelsService } from './nomenclature-models.service.js';

const referenceController = createReferenceController(nomenclatureModelsService);

export const nomenclatureModelsController = {
  ...referenceController,

  async listPrices(req, res) {
    const prices = await nomenclatureModelsService.listPrices(req.params.id, {
      dpoId: req.query.dpoId,
    });
    return success(res, prices);
  },
};
