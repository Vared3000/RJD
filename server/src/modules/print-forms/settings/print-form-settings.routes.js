import { Router } from 'express';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { validateBody } from '../../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { printFormSettingsController } from './print-form-settings.controller.js';
import { createPrintFormPartySchema } from './print-form-settings.validation.js';

export function createPrintFormSettingsRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission('admin.manage'));
  router.get('/parties', asyncHandler(printFormSettingsController.list));
  router.post(
    '/parties',
    validateBody(createPrintFormPartySchema),
    asyncHandler(printFormSettingsController.create),
  );
  return router;
}
