import { Router } from 'express';
import { tasksController } from './tasks.controller.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { validateBody } from '../../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';
import { createDraftSchema } from './tasks.validation.js';

// Задачи на доукомплектовку — тот же контур прав, что и весь остальной
// модуль Выдачи: кто оформляет и проводит документы, тот и оформляет
// довыдачу по задачам.
const PERMISSION = 'issuance.manage';

export function createTasksRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /issuance/tasks:
   *   get:
   *     tags: [Выдача/Возврат: Задачи на дособор]
   *     summary: >
   *       Список задач на доукомплектовку — открытые (ждут оформления),
   *       в оформлении (создан связанный черновик выдачи) или завершённые.
   *     parameters:
   *       - { name: status, in: query, schema: { type: string, enum: [open, in_progress, completed] } }
   *     responses:
   *       200: { description: Список задач }
   */
  router.get('/', asyncHandler(tasksController.list));

  /**
   * @openapi
   * /issuance/tasks/count:
   *   get:
   *     tags: [Выдача/Возврат: Задачи на дособор]
   *     summary: Количество открытых задач (для бейджа в меню)
   *     responses:
   *       200: { description: Количество }
   */
  router.get('/count', asyncHandler(tasksController.countOpen));

  /**
   * @openapi
   * /issuance/tasks/create-draft:
   *   post:
   *     tags: [Выдача/Возврат: Задачи на дособор]
   *     summary: >
   *       Оформить довыдачу — объединяет выбранные открытые задачи одного
   *       работника и одного склада в обычный черновик выдачи (строки с
   *       одинаковой моделью/размером/ростом суммируются). Дальше — обычное
   *       редактирование и проведение через модуль Выдачи; задачи
   *       закрываются автоматически при успешном проведении этого черновика.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [taskIds]
   *             properties:
   *               taskIds:
   *                 type: array
   *                 items: { type: string, format: uuid }
   *     responses:
   *       201: { description: Черновик выдачи создан }
   *       400: { description: Пустой список, либо задачи разных работников/складов }
   *       404: { description: Часть задач не найдена }
   *       409: { description: Часть задач уже в оформлении или завершена }
   */
  router.post(
    '/create-draft',
    validateBody(createDraftSchema),
    asyncHandler(tasksController.createDraft),
  );

  return router;
}
