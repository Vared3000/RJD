import { Router } from 'express';
import { receivingController } from './receiving.controller.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { validateBody } from '../../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import {
  createDocumentSchema,
  updateDocumentSchema,
  createLineSchema,
  updateLineSchema,
  reviseDocumentSchema,
} from './receiving.validation.js';

const PERMISSION = 'purchases.manage';

export function createReceivingRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /purchases/receiving:
   *   get:
   *     tags: [Закупки: Поступление]
   *     summary: Список документов поступления
   *     responses:
   *       200: { description: Список }
   *   post:
   *     tags: [Закупки: Поступление]
   *     summary: Создать черновик документа поступления
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: supplierId, warehouseId, documentDate (обязательно), contractNumber, invoiceNumber, note
   *     responses:
   *       201: { description: Создан черновик }
   */
  router.get('/', asyncHandler(receivingController.list));
  router.post('/', validateBody(createDocumentSchema), asyncHandler(receivingController.create));

  /**
   * @openapi
   * /purchases/receiving/{id}:
   *   get:
   *     tags: [Закупки: Поступление]
   *     summary: Документ поступления с позициями
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Найден }
   *       404: { description: Не найден }
   *   patch:
   *     tags: [Закупки: Поступление]
   *     summary: Изменить шапку документа (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлён }
   *       400: { description: Документ уже проведён }
   *   delete:
   *     tags: [Закупки: Поступление]
   *     summary: Удалить черновик документа
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Удалён }
   *       400: { description: Документ уже проведён }
   */
  router.get('/:id', asyncHandler(receivingController.getOne));
  router.patch(
    '/:id',
    validateBody(updateDocumentSchema),
    asyncHandler(receivingController.update),
  );
  router.delete('/:id', asyncHandler(receivingController.remove));

  /**
   * @openapi
   * /purchases/receiving/{id}/lines:
   *   post:
   *     tags: [Закупки: Поступление]
   *     summary: Добавить позицию в документ (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: modelId, sizeId, quantity, purchasePrice (обязательно), employeeCost, vatRate
   *     responses:
   *       201: { description: Позиция добавлена, возвращён документ целиком }
   */
  router.post(
    '/:id/lines',
    validateBody(createLineSchema),
    asyncHandler(receivingController.addLine),
  );

  /**
   * @openapi
   * /purchases/receiving/{id}/lines/{lineId}:
   *   patch:
   *     tags: [Закупки: Поступление]
   *     summary: Изменить позицию (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: lineId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлено }
   *   delete:
   *     tags: [Закупки: Поступление]
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
    asyncHandler(receivingController.updateLine),
  );
  router.delete('/:id/lines/:lineId', asyncHandler(receivingController.removeLine));

  /**
   * @openapi
   * /purchases/receiving/{id}/post:
   *   post:
   *     tags: [Закупки: Поступление]
   *     summary: Провести документ (создаёт партию, экземпляры, движения склада; необратимо)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Проведён }
   *       400: { description: Уже проведён или нет позиций }
   */
  router.post('/:id/post', asyncHandler(receivingController.post));

  /**
   * @openapi
   * /purchases/receiving/{id}/revise:
   *   post:
   *     tags: [Закупки: Поступление]
   *     summary: >
   *       Редактировать проведённый документ (задача 22): отменяет старые
   *       экземпляры/движения, сохраняет новую шапку/строки, перепроводит в
   *       одной транзакции, увеличивает номер редакции. Блокируется 409, если
   *       по затронутым экземплярам уже есть более поздние операции.
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: header (как при создании), lines (непустой массив), reason (необязательно)
   *     responses:
   *       200: { description: Редакция сохранена и проведена }
   *       404: { description: Документ не найден }
   *       400: { description: Документ ещё черновик или ошибка валидации строк }
   *       409: { description: Найдены зависимые более поздние документы }
   */
  router.post(
    '/:id/revise',
    validateBody(reviseDocumentSchema),
    asyncHandler(receivingController.revise),
  );

  return router;
}
