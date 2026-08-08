import { success } from '../../../utils/respond.js';
import { printFormSettingsService } from './print-form-settings.service.js';

export const printFormSettingsController = {
  async list(_req, res) {
    return success(res, await printFormSettingsService.list());
  },

  async create(req, res) {
    const item = await printFormSettingsService.create(req.validatedBody, {
      userId: req.user.sub,
    });
    return success(res, item, 201);
  },
};
