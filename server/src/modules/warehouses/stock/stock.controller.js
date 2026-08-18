import { stockService } from './stock.service.js';
import { success, paginatedSuccess } from '../../../utils/respond.js';
import { parsePagination } from '../../../utils/pagination.js';

export const stockController = {
  async getBalances(req, res) {
    const { warehouseId, modelId, sort, order } = req.query;
    const data = await stockService.getBalances({ warehouseId, modelId, sort, order });
    return success(res, data);
  },

  async listMovements(req, res) {
    const { warehouseId, instanceId, documentType } = req.query;
    const pagination = parsePagination(req.query);
    const { rows, count } = await stockService.listMovements({
      warehouseId,
      instanceId,
      documentType,
      ...pagination,
    });
    return paginatedSuccess(res, rows, count, pagination.limit, pagination.page);
  },
};
