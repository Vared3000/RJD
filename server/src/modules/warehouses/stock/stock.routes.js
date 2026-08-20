import { Router } from 'express';
import { stockController } from './stock.controller.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';

const PERMISSION = 'warehouse.view';

export function createStockRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /stock/balances:
   *   get:
   *     tags: [Склады: Остатки]
   *     summary: Остатки по складам (агрегат склад/модель/размер)
   *     parameters:
   *       - { name: warehouseId, in: query, schema: { type: string, format: uuid } }
   *       - { name: modelId, in: query, schema: { type: string, format: uuid } }
   *       - { name: genderCategory, in: query, schema: { type: string, enum: [male, female, unisex, unspecified] } }
   *       - { name: sizeId, in: query, schema: { type: string, format: uuid } }
   *       - { name: heightSizeId, in: query, schema: { type: string, format: uuid } }
   *       - { name: sort, in: query, schema: { type: string, enum: [warehouse, genderCategory, model, size, height, quantity] } }
   *       - { name: order, in: query, schema: { type: string, enum: [ASC, DESC] } }
   *     responses:
   *       200: { description: Список остатков }
   */
  router.get('/balances', asyncHandler(stockController.getBalances));

  /**
   * @openapi
   * /stock/movements:
   *   get:
   *     tags: [Склады: Остатки]
   *     summary: История движений склада
   *     parameters:
   *       - { name: warehouseId, in: query, schema: { type: string, format: uuid } }
   *       - { name: instanceId, in: query, schema: { type: string, format: uuid } }
   *       - { name: documentType, in: query, schema: { type: string } }
   *       - { name: limit, in: query, schema: { type: integer } }
   *     responses:
   *       200: { description: Список движений }
   */
  router.get('/movements', asyncHandler(stockController.listMovements));

  return router;
}
