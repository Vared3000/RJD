import { Router } from 'express';
import { barcodeController } from './barcode.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { printLabelsByInventorySchema, printLabelsSchema } from './barcode.validation.js';

const PERMISSION = 'warehouse.view';

export function createBarcodeRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /barcodes/{barcode}:
   *   get:
   *     tags: [Штрихкоды]
   *     summary: Поиск экземпляра по штрихкоду
   *     parameters:
   *       - { name: barcode, in: path, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Экземпляр с полной информацией }
   */
  router.get('/:barcode', asyncHandler(barcodeController.findByBarcode));

  /**
   * @openapi
   * /barcodes/inventory-number/{inventoryNumber}:
   *   get:
   *     tags: [Штрихкоды]
   *     summary: Поиск экземпляра по инвентарному номеру
   *     parameters:
   *       - { name: inventoryNumber, in: path, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Экземпляр с полной информацией }
   */
  router.get(
    '/inventory-number/:inventoryNumber',
    asyncHandler(barcodeController.findByInventoryNumber),
  );

  /**
   * @openapi
   * /barcodes/print:
   *   post:
   *     tags: [Штрихкоды]
   *     summary: Печать этикеток по ID экземпляров
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               instanceIds:
   *                 type: array
   *                 items: { type: string, format: uuid }
   *               labelType:
   *                 type: string
   *                 enum: [qr, code128]
   *                 default: qr
   *     responses:
   *       200: { description: PDF с этикетками }
   */
  router.post(
    '/labels',
    validateBody(printLabelsSchema),
    asyncHandler(barcodeController.printLabels),
  );

  /**
   * @openapi
   * /barcodes/print-by-inventory:
   *   post:
   *     tags: [Штрихкоды]
   *     summary: Печать этикеток по инвентарным номерам
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               inventoryNumbers:
   *                 type: array
   *                 items: { type: string }
   *               labelType:
   *                 type: string
   *                 enum: [qr, code128]
   *                 default: qr
   *     responses:
   *       200: { description: PDF с этикетками }
   */
  router.post(
    '/labels/by-inventory',
    validateBody(printLabelsByInventorySchema),
    asyncHandler(barcodeController.printLabelsByInventoryNumbers),
  );

  return router;
}
