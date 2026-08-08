import { receivingService } from './receiving.service.js';
import { success, paginatedSuccess } from '../../../utils/respond.js';
import { parsePagination } from '../../../utils/pagination.js';

export const receivingController = {
  async list(req, res) {
    const pagination = parsePagination(req.query);
    const { rows, count } = await receivingService.list({
      supplierId: req.query.supplierId,
      warehouseId: req.query.warehouseId,
      status: req.query.status,
      search: req.query.search,
      ...pagination,
    });
    return paginatedSuccess(res, rows, count, pagination.limit, pagination.page);
  },

  async getOne(req, res) {
    const item = await receivingService.getById(req.params.id);
    return success(res, item);
  },

  async create(req, res) {
    const item = await receivingService.create(req.validatedBody, { userId: req.user.sub });
    return success(res, item, 201);
  },

  async update(req, res) {
    const item = await receivingService.update(req.params.id, req.validatedBody);
    return success(res, item);
  },

  async remove(req, res) {
    await receivingService.remove(req.params.id);
    return success(res, { deleted: true });
  },

  async addLine(req, res) {
    const item = await receivingService.addLine(req.params.id, req.validatedBody);
    return success(res, item, 201);
  },

  async updateLine(req, res) {
    const item = await receivingService.updateLine(
      req.params.id,
      req.params.lineId,
      req.validatedBody,
    );
    return success(res, item);
  },

  async removeLine(req, res) {
    const item = await receivingService.removeLine(req.params.id, req.params.lineId);
    return success(res, item);
  },

  async post(req, res) {
    const item = await receivingService.post(req.params.id, { userId: req.user.sub });
    return success(res, item);
  },
};
