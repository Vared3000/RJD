import { issuanceService } from './issuance.service.js';
import { success } from '../../../utils/respond.js';

export const issuanceController = {
  async list(req, res) {
    const items = await issuanceService.list({ employeeId: req.query.employeeId });
    return success(res, items);
  },

  async getOne(req, res) {
    const item = await issuanceService.getById(req.params.id);
    return success(res, item);
  },

  async create(req, res) {
    const item = await issuanceService.create(req.validatedBody, { userId: req.user.sub });
    return success(res, item, 201);
  },

  async update(req, res) {
    const item = await issuanceService.update(req.params.id, req.validatedBody);
    return success(res, item);
  },

  async remove(req, res) {
    await issuanceService.remove(req.params.id);
    return success(res, { deleted: true });
  },

  async addLine(req, res) {
    const item = await issuanceService.addLine(req.params.id, req.validatedBody);
    return success(res, item, 201);
  },

  async updateLine(req, res) {
    const item = await issuanceService.updateLine(
      req.params.id,
      req.params.lineId,
      req.validatedBody,
    );
    return success(res, item);
  },

  async removeLine(req, res) {
    const item = await issuanceService.removeLine(req.params.id, req.params.lineId);
    return success(res, item);
  },

  async applyKit(req, res) {
    const { document, skipped } = await issuanceService.applyKit(req.params.id, {
      season: req.body?.season,
    });
    return success(res, document, 200, { skipped });
  },

  async previewKit(req, res) {
    const result = await issuanceService.previewKit(req.params.id, {
      season: req.query.season,
    });
    return success(res, result);
  },

  async post(req, res) {
    const item = await issuanceService.post(req.params.id, { userId: req.user.sub });
    return success(res, item);
  },
};
