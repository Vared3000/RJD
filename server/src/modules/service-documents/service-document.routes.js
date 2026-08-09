import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';

export function createServiceDocumentRouter({ controller, schemas, permission }) {
  const router = Router();
  router.use(requireAuth, requirePermission(permission));

  router.get('/', asyncHandler(controller.list));
  router.post('/', validateBody(schemas.createDocumentSchema), asyncHandler(controller.create));
  router.get('/:id', asyncHandler(controller.getOne));
  router.patch('/:id', validateBody(schemas.updateDocumentSchema), asyncHandler(controller.update));
  router.delete('/:id', asyncHandler(controller.remove));
  router.post(
    '/:id/lines',
    validateBody(schemas.createLineSchema),
    asyncHandler(controller.addLine),
  );
  router.delete('/:id/lines/:lineId', asyncHandler(controller.removeLine));
  router.post('/:id/send', asyncHandler(controller.send));
  router.post(
    '/:id/complete',
    validateBody(schemas.completeSchema),
    asyncHandler(controller.complete),
  );

  return router;
}
