import { tasksService } from './tasks.service.js';
import { success, paginatedSuccess } from '../../../utils/respond.js';
import { parsePagination } from '../../../utils/pagination.js';

export const tasksController = {
  async list(req, res) {
    const pagination = parsePagination(req.query);
    const { rows, count } = await tasksService.list({ status: req.query.status, ...pagination });
    return paginatedSuccess(res, rows, count, pagination.limit, pagination.page);
  },

  async countOpen(req, res) {
    const count = await tasksService.countOpen();
    return success(res, { count });
  },

  async createDraft(req, res) {
    const document = await tasksService.createDraft({
      taskIds: req.validatedBody.taskIds,
      userId: req.user.sub,
    });
    return success(res, document, 201);
  },
};
