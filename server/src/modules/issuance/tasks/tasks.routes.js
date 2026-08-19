import { Router } from 'express';
import { tasksController } from './tasks.controller.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requirePermission } from '../../../middlewares/permission.middleware.js';
import { asyncHandler } from '../../../utils/async-handler.js';

// Задачи на дособор — побочный эффект частичного проведения Выдачи (см.
// метод post() в issuance/documents), тот же контур прав, что и весь
// остальной модуль Выдачи: кто проводит документы, тот и закрывает задачи
// по нехватке.
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
   *       Список задач на дособор — открытые (ждут появления остатка на
   *       складе) или завершённые.
   *     parameters:
   *       - { name: status, in: query, schema: { type: string, enum: [open, completed] } }
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
   * /issuance/tasks/{id}/complete:
   *   post:
   *     tags: [Выдача/Возврат: Задачи на дособор]
   *     summary: >
   *       Завершить задачу — создаёт и проводит документ выдачи на
   *       недостающее количество тому же работнику. 400, если на складе
   *       всё ещё недостаточно остатка.
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Задача завершена }
   *       400: { description: На складе всё ещё недостаточно остатка }
   *       404: { description: Задача не найдена }
   *       409: { description: Задача уже завершена }
   */
  router.post('/:id/complete', asyncHandler(tasksController.complete));

  return router;
}
