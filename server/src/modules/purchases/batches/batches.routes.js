import { Router } from 'express';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { batchesController } from './batches.controller.js';

export function createBatchesRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission('warehouse.view'));

  /**
   * @openapi
   * /batches:
   *   get:
   *     tags: [Партии]
   *     summary: Постраничный реестр партий с остатками и поиском
   *     responses:
   *       200: { description: Список партий }
   */
  router.get('/', asyncHandler(batchesController.list));

  /**
   * @openapi
   * /batches/{id}:
   *   get:
   *     tags: [Партии]
   *     summary: Карточка партии и постраничный список экземпляров
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Карточка партии }
   *       404: { description: Партия не найдена }
   */
  router.get('/:id', asyncHandler(batchesController.getOne));

  return router;
}
