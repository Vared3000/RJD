import { Router } from 'express';
import { returnController } from './return.controller.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { validateBody } from '../../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import {
  createDocumentSchema,
  updateDocumentSchema,
  createLineSchema,
  updateLineSchema,
  unpostDocumentSchema,
} from './return.validation.js';

const PERMISSION = 'issuance.manage';

export function createReturnRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /issuance/returns:
   *   get:
   *     tags: [Выдача/Возврат: Возврат]
   *     summary: Список документов возврата
   *     parameters:
   *       - { name: employeeId, in: query, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список }
   *   post:
   *     tags: [Выдача/Возврат: Возврат]
   *     summary: Создать черновик документа возврата
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: employeeId, warehouseId, documentDate (обязательно), note
   *     responses:
   *       201: { description: Создан черновик }
   */
  router.get('/', asyncHandler(returnController.list));
  router.post('/', validateBody(createDocumentSchema), asyncHandler(returnController.create));

  /**
   * @openapi
   * /issuance/returns/available:
   *   get:
   *     tags: [Выдача/Возврат: Возврат]
   *     summary: Экземпляры, выданные указанному работнику (для выбора строк возврата)
   *     parameters:
   *       - { name: employeeId, in: query, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список }
   */
  router.get('/available', asyncHandler(returnController.availableInstances));

  /**
   * @openapi
   * /issuance/returns/{id}:
   *   get:
   *     tags: [Выдача/Возврат: Возврат]
   *     summary: Документ возврата с позициями
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Найден }
   *   patch:
   *     tags: [Выдача/Возврат: Возврат]
   *     summary: Изменить шапку документа (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлён }
   *   delete:
   *     tags: [Выдача/Возврат: Возврат]
   *     summary: Удалить черновик документа
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Удалён }
   */
  router.get('/:id', asyncHandler(returnController.getOne));
  router.patch('/:id', validateBody(updateDocumentSchema), asyncHandler(returnController.update));
  router.delete('/:id', asyncHandler(returnController.remove));

  /**
   * @openapi
   * /issuance/returns/{id}/lines:
   *   post:
   *     tags: [Выдача/Возврат: Возврат]
   *     summary: Добавить позицию в документ (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: instanceId (обязательно), condition, note
   *     responses:
   *       201: { description: Позиция добавлена, возвращён документ целиком }
   */
  router.post('/:id/lines', validateBody(createLineSchema), asyncHandler(returnController.addLine));

  /**
   * @openapi
   * /issuance/returns/{id}/lines/{lineId}:
   *   patch:
   *     tags: [Выдача/Возврат: Возврат]
   *     summary: Изменить позицию (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: lineId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлено }
   *   delete:
   *     tags: [Выдача/Возврат: Возврат]
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
    asyncHandler(returnController.updateLine),
  );
  router.delete('/:id/lines/:lineId', asyncHandler(returnController.removeLine));

  /**
   * @openapi
   * /issuance/returns/{id}/post:
   *   post:
   *     tags: [Выдача/Возврат: Возврат]
   *     summary: >
   *       Провести документ (переводит экземпляры в in_stock на склад документа,
   *       создаёт движения склада; необратимо)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Проведён }
   *       400: { description: Уже проведён, нет позиций или экземпляр не выдан работнику }
   */
  router.post('/:id/post', asyncHandler(returnController.post));
  router.post(
    '/:id/unpost',
    requirePermission('documents.revise'),
    validateBody(unpostDocumentSchema),
    asyncHandler(returnController.unpost),
  );

  return router;
}
