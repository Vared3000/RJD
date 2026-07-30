import { dpoService } from './dpo.service.js';
import { success } from '../../utils/respond.js';

export const dpoController = {
  async list(req, res) {
    const items = await dpoService.list({
      includeArchived: req.query.includeArchived === 'true',
      search: req.query.search,
    });
    return success(res, items);
  },

  async getOne(req, res) {
    const item = await dpoService.getById(req.params.id);
    return success(res, item);
  },

  async getHistory(req, res) {
    const history = await dpoService.getHistory(req.params.id);
    return success(res, history);
  },

  async create(req, res) {
    const item = await dpoService.create(req.validatedBody);
    return success(res, item, 201);
  },

  async replace(req, res) {
    const item = await dpoService.update(req.params.id, req.validatedBody, { userId: req.user.sub });
    return success(res, item);
  },

  async update(req, res) {
    const item = await dpoService.update(req.params.id, req.validatedBody, { userId: req.user.sub });
    return success(res, item);
  },

  async archive(req, res) {
    await dpoService.archive(req.params.id);
    return success(res, { archived: true });
  },

  async restore(req, res) {
    await dpoService.restore(req.params.id);
    return success(res, { restored: true });
  },
};
