import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { startupImportController } from './startup-import.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

export function createStartupImportRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission('admin.manage'));
  router.get('/', asyncHandler(startupImportController.list));
  router.get('/template', asyncHandler(startupImportController.template));
  router.post('/preview', upload.single('file'), asyncHandler(startupImportController.preview));
  router.post('/:id/apply', asyncHandler(startupImportController.apply));
  return router;
}
