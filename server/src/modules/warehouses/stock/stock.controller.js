import { stockService } from './stock.service.js';
import { success, paginatedSuccess } from '../../../utils/respond.js';

export const stockController = {
  async getBalances(req, res) {
    const { warehouseId, modelId } = req.query;
    const data = await stockService.getBalances({ warehouseId, modelId });
    return success(res, data);
  },

  async listMovements(req, res) {
    const { warehouseId, instanceId, documentType, page, limit, sort, order } = req.query;
    const { rows, count } = await stockService.listMovements({
      warehouseId,
      instanceId,
      documentType,
      page: page ?? 1,
      limit: limit ?? 50,
      sort,
      order,
    });
    return paginatedSuccess(res, rows, count, Number(limit) || 50, Number(page) || 1);
  },
};
