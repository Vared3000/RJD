import { Router } from 'express';
import { writeoffController } from './writeoff.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  createDocumentSchema,
  updateDocumentSchema,
  createLineSchema,
  updateLineSchema,
} from './writeoff.validation.js';

const PERMISSION = 'writeoff.manage';

export function createWriteoffRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /writeoff/documents:
   *   get:
   *     tags: [Списание]
   *     summary: Список документов списания
   *     parameters:
   *       - { name: warehouseId, in: query, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список }
   *   post:
   *     tags: [Списание]
   *     summary: Создать черновик документа списания
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
  router.get('/', asyncHandler(writeoffController.list));
  router.post('/', validateBody(createDocumentSchema), asyncHandler(writeoffController.create));

  /**
   * @openapi
   * /writeoff/documents/{id}:
   *   get:
   *     tags: [Списание]
   *     summary: Документ списания с позициями
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Найден }
   *   patch:
   *     tags: [Списание]
   *     summary: Изменить шапку документа (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлён }
   *   delete:
   *     tags: [Списание]
   *     summary: Удалить черновик документа
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Удалён }
   */
  router.get('/:id', asyncHandler(writeoffController.getOne));
  router.patch('/:id', validateBody(updateDocumentSchema), asyncHandler(writeoffController.update));
  router.delete('/:id', asyncHandler(writeoffController.remove));

  /**
   * @openapi
   * /writeoff/documents/{id}/lines:
   *   post:
   *     tags: [Списание]
   *     summary: Добавить позицию в документ (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: instanceId, reason (обязательно), note
   *     responses:
   *       201: { description: Позиция добавлена, возвращён документ целиком }
   */
  router.post(
    '/:id/lines',
    validateBody(createLineSchema),
    asyncHandler(writeoffController.addLine),
  );

  /**
   * @openapi
   * /writeoff/documents/{id}/lines/{lineId}:
   *   patch:
   *     tags: [Списание]
   *     summary: Изменить позицию (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: lineId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлено }
   *   delete:
   *     tags: [Списание]
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
    asyncHandler(writeoffController.updateLine),
  );
  router.delete('/:id/lines/:lineId', asyncHandler(writeoffController.removeLine));

  /**
   * @openapi
   * /writeoff/documents/{id}/post:
   *   post:
   *     tags: [Списание]
   *     summary: >
   *       Провести документ (переводит экземпляры в status='write_off',
   *       создаёт движения склада; необратимо)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Проведён }
   *       400: { description: Уже проведён, нет позиций или экземпляр недоступен на складе }
   */
  router.post('/:id/post', asyncHandler(writeoffController.post));

  return router;
}
