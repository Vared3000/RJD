import { stockService } from './stock.service.js';
import { success } from '../../../utils/respond.js';

export const stockController = {
  async getBalances(req, res) {
    const { warehouseId, modelId } = req.query;
    const data = await stockService.getBalances({ warehouseId, modelId });
    return success(res, data);
  },

  async listMovements(req, res) {
    const { warehouseId, instanceId, documentType, limit } = req.query;
    const data = await stockService.listMovements({
      warehouseId,
      instanceId,
      documentType,
      limit: limit ? Number(limit) : undefined,
    });
    return success(res, data);
  },
};
