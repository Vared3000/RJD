import { Router } from 'express';
import { inventoryController } from './inventory.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  createDocumentSchema,
  updateDocumentSchema,
  updateLineSchema,
} from './inventory.validation.js';

const PERMISSION = 'inventory.manage';

export function createInventoryRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /inventory/documents:
   *   get:
   *     tags: [Инвентаризация]
   *     summary: Список документов инвентаризации
   *     parameters:
   *       - { name: warehouseId, in: query, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список }
   *   post:
   *     tags: [Инвентаризация]
   *     summary: >
   *       Создать документ (сразу снимает снимок остатков склада —
   *       строки создаются автоматически из текущих in_stock экземпляров)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: warehouseId, documentDate (обязательно), note
   *     responses:
   *       201: { description: "Создан, meta.summary содержит total/confirmed/missing" }
   */
  router.get('/', asyncHandler(inventoryController.list));
  router.post('/', validateBody(createDocumentSchema), asyncHandler(inventoryController.create));

  /**
   * @openapi
   * /inventory/documents/{id}:
   *   get:
   *     tags: [Инвентаризация]
   *     summary: Документ с позициями и сводкой (meta.summary)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Найден }
   *   patch:
   *     tags: [Инвентаризация]
   *     summary: Изменить дату/примечание (только черновик, склад не редактируется)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлён }
   *   delete:
   *     tags: [Инвентаризация]
   *     summary: Удалить черновик документа
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Удалён }
   */
  router.get('/:id', asyncHandler(inventoryController.getOne));
  router.patch(
    '/:id',
    validateBody(updateDocumentSchema),
    asyncHandler(inventoryController.update),
  );
  router.delete('/:id', asyncHandler(inventoryController.remove));

  /**
   * @openapi
   * /inventory/documents/{id}/lines/{lineId}:
   *   patch:
   *     tags: [Инвентаризация]
   *     summary: Подтвердить/снять подтверждение позиции по факту пересчёта (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: lineId, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: 'confirmed (boolean), note' }
   *     responses:
   *       200: { description: Обновлено }
   *   delete:
   *     tags: [Инвентаризация]
   *     summary: Удалить позицию из снимка (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: lineId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Удалено }
   */
  router.patch(
    '/:id/lines/:lineId',
    validateBody(updateLineSchema),
    asyncHandler(inventoryController.updateLine),
  );
  router.delete('/:id/lines/:lineId', asyncHandler(inventoryController.removeLine));

  /**
   * @openapi
   * /inventory/documents/{id}/complete:
   *   post:
   *     tags: [Инвентаризация]
   *     summary: >
   *       Завершить сверку (необратимо). Остатки НЕ меняются — расхождения
   *       (неподтверждённые позиции) остаются видны в документе, решение
   *       по ним принимается отдельным документом "Списание".
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Завершён }
   *       400: { description: Уже завершён }
   */
  router.post('/:id/complete', asyncHandler(inventoryController.complete));

  return router;
}
