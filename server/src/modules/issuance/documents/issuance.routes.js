import { Router } from 'express';
import { issuanceController } from './issuance.controller.js';
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
} from './issuance.validation.js';

const PERMISSION = 'issuance.manage';

export function createIssuanceRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /issuance/documents:
   *   get:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: Список документов выдачи
   *     parameters:
   *       - { name: employeeId, in: query, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список }
   *   post:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: Создать черновик документа выдачи
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
  router.get('/', asyncHandler(issuanceController.list));
  router.post('/', validateBody(createDocumentSchema), asyncHandler(issuanceController.create));

  /**
   * @openapi
   * /issuance/documents/{id}:
   *   get:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: Документ выдачи с позициями
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Найден }
   *   patch:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: Изменить шапку документа (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлён }
   *   delete:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: Удалить черновик документа
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Удалён }
   */
  router.get('/:id', asyncHandler(issuanceController.getOne));
  router.patch('/:id', validateBody(updateDocumentSchema), asyncHandler(issuanceController.update));
  router.delete('/:id', asyncHandler(issuanceController.remove));

  /**
   * @openapi
   * /issuance/documents/{id}/lines:
   *   post:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: Добавить позицию в документ (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: modelId, sizeId, quantity (обязательно)
   *     responses:
   *       201: { description: Позиция добавлена, возвращён документ целиком }
   */
  router.post(
    '/:id/lines',
    validateBody(createLineSchema),
    asyncHandler(issuanceController.addLine),
  );

  /**
   * @openapi
   * /issuance/documents/{id}/lines/{lineId}:
   *   patch:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: Изменить позицию (только черновик)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: lineId, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Обновлено }
   *   delete:
   *     tags: [Выдача/Возврат: Выдача]
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
    asyncHandler(issuanceController.updateLine),
  );
  router.delete('/:id/lines/:lineId', asyncHandler(issuanceController.removeLine));

  /**
   * @openapi
   * /issuance/documents/{id}/assembly-order:
   *   get:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: >
   *       Задание на сборку — рабочий документ для склада со списком текущих
   *       позиций документа (модель, размер, рост, количество). Не входит в
   *       каталог официальных печатных форм (/print-forms), не требует
   *       проведения документа.
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: format, in: query, schema: { type: string, enum: [xlsx, pdf], default: pdf } }
   *     responses:
   *       200: { description: Файл задания на сборку }
   *       400: { description: В документе нет позиций }
   */
  router.get('/:id/assembly-order', asyncHandler(issuanceController.assemblyOrder));

  /**
   * @openapi
   * /issuance/documents/{id}/apply-kit:
   *   post:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: >
   *       Быстрый подбор комплекта (раздел 9 ТЗ) — добавляет строки по комплекту
   *       должности работника, подставляя размер работника по типу размера модели.
   *       Позиции без подходящего размера у работника пропускаются (см. meta.skipped).
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               season: { type: string, enum: [summer, winter] }
   *             required: [season]
   *     responses:
   *       200: { description: Строки добавлены }
   */
  router.post('/:id/apply-kit', asyncHandler(issuanceController.applyKit));

  /**
   * @openapi
   * /issuance/documents/{id}/kit-preview:
   *   get:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: >
   *       Предпросмотр комплекта (раздел 9 ТЗ) — позиции комплекта должности
   *       работника строго по его размерам, с остатком на складе документа под
   *       каждую позицию. Ничего не создаёт — добавление строки отдельным
   *       вызовом POST .../lines.
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *       - { name: season, in: query, required: true, schema: { type: string, enum: [summer, winter] } }
   *     responses:
   *       200: { description: Список позиций комплекта с остатками }
   */
  router.get('/:id/kit-preview', asyncHandler(issuanceController.previewKit));

  /**
   * @openapi
   * /issuance/documents/{id}/post:
   *   post:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: >
   *       Провести документ (подбирает доступные экземпляры под каждую строку,
   *       переводит их в статус issued с привязкой к работнику, создаёт движения
   *       склада; необратимо)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Проведён }
   *       400: { description: Уже проведён, нет позиций или недостаточно остатка }
   */
  router.post('/:id/post', asyncHandler(issuanceController.post));

  /**
   * @openapi
   * /issuance/documents/{id}/revise:
   *   post:
   *     tags: [Выдача/Возврат: Выдача]
   *     summary: >
   *       Редактировать проведённый документ (задача 22): освобождает старые
   *       экземпляры, сохраняет новую шапку/строки, перепроводит свежим
   *       FIFO-подбором с пересчётом цены в одной транзакции, увеличивает
   *       номер редакции и помечает затронутые месячные акты как требующие
   *       пересчёта. Блокируется 409, если по затронутым экземплярам уже
   *       есть более поздние операции.
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
   *       400: { description: Документ ещё черновик, ошибка валидации или недостаточно остатка }
   *       409: { description: Найдены зависимые более поздние документы }
   */
  router.post(
    '/:id/revise',
    validateBody(reviseDocumentSchema),
    asyncHandler(issuanceController.revise),
  );

  return router;
}
