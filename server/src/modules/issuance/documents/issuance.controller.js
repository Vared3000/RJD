import { issuanceService } from './issuance.service.js';
import { assemblyOrderService } from './assembly-order.js';
import { success, paginatedSuccess } from '../../../utils/respond.js';
import { parsePagination } from '../../../utils/pagination.js';
import { attachmentHeader } from '../../../utils/attachment-header.js';

export const issuanceController = {
  async list(req, res) {
    const pagination = parsePagination(req.query);
    const { rows, count } = await issuanceService.list({
      employeeId: req.query.employeeId,
      warehouseId: req.query.warehouseId,
      status: req.query.status,
      search: req.query.search,
      ...pagination,
    });
    return paginatedSuccess(res, rows, count, pagination.limit, pagination.page);
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

  async revise(req, res) {
    const item = await issuanceService.revise(req.params.id, req.validatedBody, {
      userId: req.user.sub,
    });
    return success(res, item);
  },

  async assemblyOrder(req, res) {
    const file = await assemblyOrderService.generate(req.params.id, req.query.format || 'pdf');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', attachmentHeader(file.fileName));
    res.setHeader('Content-Length', file.buffer.length);
    return res.send(file.buffer);
  },
};
