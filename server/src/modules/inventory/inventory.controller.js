import { inventoryService } from './inventory.service.js';
import { success, paginatedSuccess } from '../../utils/respond.js';

export const inventoryController = {
  async list(req, res) {
    const { rows, count } = await inventoryService.list({
      warehouseId: req.query.warehouseId,
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort,
      order: req.query.order,
    });
    return paginatedSuccess(
      res,
      rows,
      count,
      Number(req.query.limit) || 50,
      Number(req.query.page) || 1,
    );
  },

  async getOne(req, res) {
    const { document, summary } = await inventoryService.getById(req.params.id);
    return success(res, document, 200, { summary });
  },

  async create(req, res) {
    const { document, summary } = await inventoryService.create(req.validatedBody, {
      userId: req.user.sub,
    });
    return success(res, document, 201, { summary });
  },

  async update(req, res) {
    const { document, summary } = await inventoryService.update(req.params.id, req.validatedBody);
    return success(res, document, 200, { summary });
  },

  async remove(req, res) {
    await inventoryService.remove(req.params.id);
    return success(res, { deleted: true });
  },

  async updateLine(req, res) {
    const { document, summary } = await inventoryService.updateLine(
      req.params.id,
      req.params.lineId,
      req.validatedBody,
    );
    return success(res, document, 200, { summary });
  },

  async removeLine(req, res) {
    const { document, summary } = await inventoryService.removeLine(
      req.params.id,
      req.params.lineId,
    );
    return success(res, document, 200, { summary });
  },

  async complete(req, res) {
    const { document, summary } = await inventoryService.complete(req.params.id, {
      userId: req.user.sub,
    });
    return success(res, document, 200, { summary });
  },
};
