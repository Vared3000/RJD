import { Router } from 'express';
import { adjustmentController } from './adjustment.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  createDocumentSchema,
  updateDocumentSchema,
  createFromInventorySchema,
  createLineSchema,
  updateLineSchema,
} from './adjustment.validation.js';

const PERMISSION = 'adjustments.manage';

export function createAdjustmentsRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /adjustments/documents:
   *   get:
   *     tags: [Корректировка]
   *     summary: Список документов корректировки
   *     parameters:
   *       - { name: warehouseId, in: query, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список }
   *   post:
   *     tags: [Корректировка]
   *     summary: Создать черновик документа корректировки
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: warehouseId, documentDate (обязательно), note
   *     responses:
   *       201: { description: Создан черновик }
   */
  router.get('/', asyncHandler(adjustmentController.list));
  router.post('/', validateBody(createDocumentSchema), asyncHandler(adjustmentController.create));

  /**
   * @openapi
   * /adjustments/documents/from-inventory/{inventoryDocumentId}:
   *   post:
   *     tags: [Корректировка]
   *     summary: >
   *       Создать черновик из завершённой инвентаризации — строки shortage по
   *       каждой неподтверждённой позиции снимка остатков.
   *     parameters:
   *       - { name: inventoryDocumentId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       201: { description: Создан черновик }
   *       400: { description: Инвентаризация не завершена или без расхождений }
   */
  router.post(
    '/from-inventory/:inventoryDocumentId',
    validateBody(createFromInventorySchema),
    asyncHandler(adjustmentController.createFromInventory),
  );

  /**
   * @openapi
   * /adjustments/documents/{id}:
   *   get:
   *     tags: [Корректировка]
   *     summary: Документ корректировки с позициями
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Найден }
   *   patch:
   *     tags: [Корректировка]
   *     summary: Изменить шапку документа (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлён }
   *   delete:
   *     tags: [Корректировка]
   *     summary: Удалить черновик документа
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Удалён }
   */
  router.get('/:id', asyncHandler(adjustmentController.getOne));
  router.patch(
    '/:id',
    validateBody(updateDocumentSchema),
    asyncHandler(adjustmentController.update),
  );
  router.delete('/:id', asyncHandler(adjustmentController.remove));

  /**
   * @openapi
   * /adjustments/documents/{id}/lines:
   *   post:
   *     tags: [Корректировка]
   *     summary: >
   *       Добавить позицию (только черновик). adjustmentType определяет
   *       остальные обязательные поля: surplus (modelId, toWarehouseId, ...),
   *       shortage/relocate/condition (instanceId, ...). reason (основание)
   *       обязателен для всех типов.
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       201: { description: Позиция добавлена, возвращён документ целиком }
   */
  router.post(
    '/:id/lines',
    validateBody(createLineSchema),
    asyncHandler(adjustmentController.addLine),
  );

  /**
   * @openapi
   * /adjustments/documents/{id}/lines/{lineId}:
   *   patch:
   *     tags: [Корректировка]
   *     summary: Изменить позицию (только черновик; тип корректировки менять нельзя)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: lineId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлено }
   *   delete:
   *     tags: [Корректировка]
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
    asyncHandler(adjustmentController.updateLine),
  );
  router.delete('/:id/lines/:lineId', asyncHandler(adjustmentController.removeLine));

  /**
   * @openapi
   * /adjustments/documents/{id}/post:
   *   post:
   *     tags: [Корректировка]
   *     summary: >
   *       Провести документ (необратимо). surplus создаёт новый экземпляр,
   *       shortage списывает (status='write_off'), relocate меняет склад,
   *       condition меняет физическое состояние — каждая строка создаёт
   *       движение склада и событие истории экземпляра.
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Проведён }
   *       400: { description: Уже проведён, нет позиций или строка неприменима к текущему состоянию экземпляра }
   */
  router.post('/:id/post', asyncHandler(adjustmentController.post));

  return router;
}
