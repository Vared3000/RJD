import { returnService } from './return.service.js';
import { success, paginatedSuccess } from '../../../utils/respond.js';
import { ApiError } from '../../../utils/api-error.js';
import { parsePagination } from '../../../utils/pagination.js';

export const returnController = {
  async list(req, res) {
    const pagination = parsePagination(req.query);
    const { rows, count } = await returnService.list({
      employeeId: req.query.employeeId,
      warehouseId: req.query.warehouseId,
      status: req.query.status,
      search: req.query.search,
      ...pagination,
    });
    return paginatedSuccess(res, rows, count, pagination.limit, pagination.page);
  },

  async availableInstances(req, res) {
    if (!req.query.employeeId) {
      throw ApiError.badRequest('Укажите employeeId');
    }
    const items = await returnService.findIssuedInstances(req.query.employeeId);
    return success(res, items);
  },

  async getOne(req, res) {
    const item = await returnService.getById(req.params.id);
    return success(res, item);
  },

  async create(req, res) {
    const item = await returnService.create(req.validatedBody, { userId: req.user.sub });
    return success(res, item, 201);
  },

  async update(req, res) {
    const item = await returnService.update(req.params.id, req.validatedBody);
    return success(res, item);
  },

  async remove(req, res) {
    await returnService.remove(req.params.id);
    return success(res, { deleted: true });
  },

  async addLine(req, res) {
    const item = await returnService.addLine(req.params.id, req.validatedBody);
    return success(res, item, 201);
  },

  async updateLine(req, res) {
    const item = await returnService.updateLine(
      req.params.id,
      req.params.lineId,
      req.validatedBody,
    );
    return success(res, item);
  },

  async removeLine(req, res) {
    const item = await returnService.removeLine(req.params.id, req.params.lineId);
    return success(res, item);
  },

  async post(req, res) {
    const item = await returnService.post(req.params.id, { userId: req.user.sub });
    return success(res, item);
  },
};
