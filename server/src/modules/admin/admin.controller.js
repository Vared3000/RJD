import { adminService } from './admin.service.js';
import { success } from '../../utils/respond.js';

function parseIsActive(value) {
  if (value === undefined) return undefined;
  return value === 'true';
}

export const adminController = {
  async list(req, res) {
    const items = await adminService.list({
      search: req.query.search,
      roleId: req.query.roleId,
      isActive: parseIsActive(req.query.isActive),
    });
    return success(res, items);
  },

  async getOne(req, res) {
    const item = await adminService.getById(req.params.id);
    return success(res, item);
  },

  async create(req, res) {
    const item = await adminService.create(req.validatedBody, { userId: req.user.sub });
    return success(res, item, 201);
  },

  async update(req, res) {
    const item = await adminService.update(req.params.id, req.validatedBody, {
      userId: req.user.sub,
    });
    return success(res, item);
  },

  async resetPassword(req, res) {
    const item = await adminService.resetPassword(req.params.id, req.validatedBody, {
      userId: req.user.sub,
    });
    return success(res, item);
  },

  async revokeSessions(req, res) {
    const item = await adminService.revokeSessions(req.params.id, { userId: req.user.sub });
    return success(res, item);
  },

  async listRoles(req, res) {
    const items = await adminService.listRoles();
    return success(res, items);
  },

  async listPermissions(req, res) {
    const items = await adminService.listPermissions();
    return success(res, items);
  },

  async getEvents(req, res) {
    const items = await adminService.getEvents(req.params.id);
    return success(res, items);
  },
};
