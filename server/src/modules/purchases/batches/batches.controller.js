import { parsePagination } from '../../../utils/pagination.js';
import { paginatedSuccess, success } from '../../../utils/respond.js';
import { batchesService } from './batches.service.js';

export const batchesController = {
  async list(req, res) {
    const pagination = parsePagination(req.query);
    const { rows, count } = await batchesService.list({
      includeArchived: req.query.includeArchived === 'true',
      search: req.query.search,
      ...pagination,
    });
    return paginatedSuccess(res, rows, count, pagination.limit, pagination.page);
  },

  async getOne(req, res) {
    const pagination = parsePagination(req.query);
    const { item, instanceCount } = await batchesService.getById(req.params.id, {
      search: req.query.search,
      ...pagination,
    });
    return success(res, item, 200, {
      instances: {
        total: instanceCount,
        pages: Math.ceil(instanceCount / pagination.limit),
        page: pagination.page,
        limit: pagination.limit,
      },
    });
  },
};
