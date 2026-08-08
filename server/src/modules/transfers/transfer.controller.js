import { transferService } from './transfer.service.js';
import { success, paginatedSuccess } from '../../utils/respond.js';

export const transferController = {
  async list(req, res) {
    const { rows, count } = await transferService.list({
      warehouseId: req.query.warehouseId,
      fromWarehouseId: req.query.fromWarehouseId,
      toWarehouseId: req.query.toWarehouseId,
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
    const item = await transferService.getById(req.params.id);
    return success(res, item);
  },

  async create(req, res) {
    const item = await transferService.create(req.validatedBody, { userId: req.user.sub });
    return success(res, item, 201);
  },

  async update(req, res) {
    const item = await transferService.update(req.params.id, req.validatedBody);
    return success(res, item);
  },

  async remove(req, res) {
    await transferService.remove(req.params.id);
    return success(res, { deleted: true });
  },

  async addLine(req, res) {
    const item = await transferService.addLine(req.params.id, req.validatedBody);
    return success(res, item, 201);
  },

  async updateLine(req, res) {
    const item = await transferService.updateLine(
      req.params.id,
      req.params.lineId,
      req.validatedBody,
    );
    return success(res, item);
  },

  async removeLine(req, res) {
    const item = await transferService.removeLine(req.params.id, req.params.lineId);
    return success(res, item);
  },

  async post(req, res) {
    const item = await transferService.post(req.params.id, { userId: req.user.sub });
    return success(res, item);
  },
};
