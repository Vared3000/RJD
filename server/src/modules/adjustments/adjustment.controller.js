import { adjustmentService } from './adjustment.service.js';
import { success } from '../../utils/respond.js';

export const adjustmentController = {
  async list(req, res) {
    const items = await adjustmentService.list({ warehouseId: req.query.warehouseId });
    return success(res, items);
  },

  async getOne(req, res) {
    const item = await adjustmentService.getById(req.params.id);
    return success(res, item);
  },

  async create(req, res) {
    const item = await adjustmentService.create(req.validatedBody, { userId: req.user.sub });
    return success(res, item, 201);
  },

  async createFromInventory(req, res) {
    const item = await adjustmentService.createFromInventory(
      req.params.inventoryDocumentId,
      req.validatedBody,
      { userId: req.user.sub },
    );
    return success(res, item, 201);
  },

  async update(req, res) {
    const item = await adjustmentService.update(req.params.id, req.validatedBody);
    return success(res, item);
  },

  async remove(req, res) {
    await adjustmentService.remove(req.params.id);
    return success(res, { deleted: true });
  },

  async addLine(req, res) {
    const item = await adjustmentService.addLine(req.params.id, req.validatedBody);
    return success(res, item, 201);
  },

  async updateLine(req, res) {
    const item = await adjustmentService.updateLine(
      req.params.id,
      req.params.lineId,
      req.validatedBody,
    );
    return success(res, item);
  },

  async removeLine(req, res) {
    const item = await adjustmentService.removeLine(req.params.id, req.params.lineId);
    return success(res, item);
  },

  async post(req, res) {
    const item = await adjustmentService.post(req.params.id, { userId: req.user.sub });
    return success(res, item);
  },
};
