import { Router } from 'express';
import { authController } from './auth.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

export function createAuthRouter() {
  const router = Router();

  /**
   * @openapi
   * /auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Вход по логину и паролю
   *     security: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [login, password]
   *             properties:
   *               login: { type: string }
   *               password: { type: string }
   *     responses:
   *       200: { description: Успешный вход, access-токен в теле, refresh-токен в httpOnly cookie }
   *       401: { description: Неверный логин или пароль }
   */
  router.post('/login', asyncHandler(authController.login));

  /**
   * @openapi
   * /auth/refresh:
   *   post:
   *     tags: [Auth]
   *     summary: Обновление access-токена по refresh-токену из cookie
   *     security: []
   *     responses:
   *       200: { description: Новый access-токен }
   *       401: { description: Сессия истекла }
   */
  router.post('/refresh', asyncHandler(authController.refresh));

  /**
   * @openapi
   * /auth/logout:
   *   post:
   *     tags: [Auth]
   *     summary: Выход, отзыв refresh-токена
   *     security: []
   *     responses:
   *       200: { description: Выход выполнен }
   */
  router.post('/logout', asyncHandler(authController.logout));

  /**
   * @openapi
   * /auth/me:
   *   get:
   *     tags: [Auth]
   *     summary: Текущий пользователь, роль и права
   *     responses:
   *       200: { description: Профиль пользователя }
   *       401: { description: Требуется авторизация }
   */
  router.get('/me', requireAuth, asyncHandler(authController.me));

  return router;
}
