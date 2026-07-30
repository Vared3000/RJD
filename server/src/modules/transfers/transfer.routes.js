import { Router } from 'express';
import { transferController } from './transfer.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  createDocumentSchema,
  updateDocumentSchema,
  createLineSchema,
  updateLineSchema,
} from './transfer.validation.js';

const PERMISSION = 'transfers.manage';

export function createTransferRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /transfers/documents:
   *   get:
   *     tags: [Перемещение]
   *     summary: Список документов перемещения
   *     parameters:
   *       - { name: warehouseId, in: query, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список }
   *   post:
   *     tags: [Перемещение]
   *     summary: Создать черновик документа перемещения
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: fromWarehouseId, toWarehouseId (обязательно, должны отличаться), documentDate, note
   *     responses:
   *       201: { description: Создан черновик }
   */
  router.get('/', asyncHandler(transferController.list));
  router.post('/', validateBody(createDocumentSchema), asyncHandler(transferController.create));

  /**
   * @openapi
   * /transfers/documents/{id}:
   *   get:
   *     tags: [Перемещение]
   *     summary: Документ перемещения с позициями
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Найден }
   *   patch:
   *     tags: [Перемещение]
   *     summary: Изменить шапку документа (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлён }
   *   delete:
   *     tags: [Перемещение]
   *     summary: Удалить черновик документа
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Удалён }
   */
  router.get('/:id', asyncHandler(transferController.getOne));
  router.patch('/:id', validateBody(updateDocumentSchema), asyncHandler(transferController.update));
  router.delete('/:id', asyncHandler(transferController.remove));

  /**
   * @openapi
   * /transfers/documents/{id}/lines:
   *   post:
   *     tags: [Перемещение]
   *     summary: Добавить позицию в документ (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: instanceId (обязательно), note
   *     responses:
   *       201: { description: Позиция добавлена, возвращён документ целиком }
   */
  router.post(
    '/:id/lines',
    validateBody(createLineSchema),
    asyncHandler(transferController.addLine),
  );

  /**
   * @openapi
   * /transfers/documents/{id}/lines/{lineId}:
   *   patch:
   *     tags: [Перемещение]
   *     summary: Изменить позицию (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: lineId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлено }
   *   delete:
   *     tags: [Перемещение]
   *     summary: Удалить позицию (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: lineId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Удалено }
   */
  router.patch(
    '/:id/lines/:lineId',
    validateBody(updateLineSchema),
    asyncHandler(transferController.updateLine),
  );
  router.delete('/:id/lines/:lineId', asyncHandler(transferController.removeLine));

  /**
   * @openapi
   * /transfers/documents/{id}/post:
   *   post:
   *     tags: [Перемещение]
   *     summary: >
   *       Провести документ (переводит экземпляры на склад-получатель,
   *       создаёт движения склада; необратимо)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Проведён }
   *       400: { description: Уже проведён, нет позиций или экземпляр недоступен на складе-отправителе }
   */
  router.post('/:id/post', asyncHandler(transferController.post));

  return router;
}
