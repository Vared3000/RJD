import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from './admin.validation.js';

const PERMISSION = 'admin.manage';

export function createAdminRouter() {
  const router = Router();
  router.use(requireAuth, requirePermission(PERMISSION));

  /**
   * @openapi
   * /admin/backup-status:
   *   get:
   *     tags: [Администрирование]
   *     summary: Состояние резервных копий на трёх ПК без путей и секретов
   *     responses:
   *       200: { description: Текущая попытка, свободное место и последняя успешная копия }
   *       403: { description: Требуются права администратора }
   */
  router.get('/backup-status', asyncHandler(adminController.backupStatus));

  /**
   * @openapi
   * /admin/ha-status:
   *   get:
   *     tags: [Администрирование]
   *     summary: Безопасное состояние трёх HA-узлов без технических endpoint и секретов
   *     responses:
   *       200: { description: Режим, primary, quorum и роли трёх узлов }
   *       403: { description: Требуются права администратора }
   */
  router.get('/ha-status', asyncHandler(adminController.haStatus));

  /**
   * @openapi
   * /admin/users:
   *   get:
   *     tags: [Администрирование]
   *     summary: Список пользователей
   *     parameters:
   *       - { name: search, in: query, schema: { type: string }, description: Поиск по логину/ФИО }
   *       - { name: roleId, in: query, schema: { type: string, format: uuid } }
   *       - { name: isActive, in: query, schema: { type: string, enum: ['true', 'false'] } }
   *     responses:
   *       200: { description: Список пользователей (без passwordHash) }
   *   post:
   *     tags: [Администрирование]
   *     summary: Создать пользователя
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: login, password, fullName, roleId (все обязательны)
   *     responses:
   *       201: { description: Создан }
   *       409: { description: Логин уже занят }
   */
  router.get('/users', asyncHandler(adminController.list));
  router.post('/users', validateBody(createUserSchema), asyncHandler(adminController.create));

  /**
   * @openapi
   * /admin/users/{id}:
   *   get:
   *     tags: [Администрирование]
   *     summary: Пользователь по id
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Найден }
   *   patch:
   *     tags: [Администрирование]
   *     summary: >
   *       Изменить ФИО/роль/статус блокировки. Нельзя заблокировать себя;
   *       нельзя убрать права последнего активного администратора; блокировка
   *       отзывает все refresh-токены пользователя.
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: fullName, roleId, isActive (все опциональны)
   *     responses:
   *       200: { description: Обновлён }
   *       400: { description: Самоблокировка или последний администратор }
   */
  router.get('/users/:id', asyncHandler(adminController.getOne));
  router.patch('/users/:id', validateBody(updateUserSchema), asyncHandler(adminController.update));

  /**
   * @openapi
   * /admin/users/{id}/reset-password:
   *   post:
   *     tags: [Администрирование]
   *     summary: Сбросить пароль пользователя
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: 'password (обязательно, требования к сложности)' }
   *     responses:
   *       200: { description: Пароль изменён }
   */
  router.post(
    '/users/:id/reset-password',
    validateBody(resetPasswordSchema),
    asyncHandler(adminController.resetPassword),
  );

  /**
   * @openapi
   * /admin/users/{id}/revoke-sessions:
   *   post:
   *     tags: [Администрирование]
   *     summary: Завершить все сессии пользователя (отозвать refresh-токены)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Сессии завершены }
   */
  router.post('/users/:id/revoke-sessions', asyncHandler(adminController.revokeSessions));

  /**
   * @openapi
   * /admin/users/{id}/events:
   *   get:
   *     tags: [Администрирование]
   *     summary: Журнал действий над пользователем (смена роли, блокировка, сброс пароля)
   *     parameters:
   *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       200: { description: Список событий, новые первыми }
   */
  router.get('/users/:id/events', asyncHandler(adminController.getEvents));

  /**
   * @openapi
   * /admin/roles:
   *   get:
   *     tags: [Администрирование]
   *     summary: Список ролей
   *     responses:
   *       200: { description: Список ролей }
   */
  router.get('/roles', asyncHandler(adminController.listRoles));

  /**
   * @openapi
   * /admin/permissions:
   *   get:
   *     tags: [Администрирование]
   *     summary: Каталог прав системы
   *     responses:
   *       200: { description: Список прав }
   */
  router.get('/permissions', asyncHandler(adminController.listPermissions));

  return router;
}
