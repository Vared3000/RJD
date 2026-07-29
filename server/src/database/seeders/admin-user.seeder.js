import { models } from '../models/index.js';
import { env } from '../../config/env.js';
import { hashPassword } from '../../utils/password.js';
import { logger } from '../../utils/logger.js';

export async function seedAdminUser() {
  const { User, Role } = models;

  const existing = await User.findOne({ where: { login: env.BOOTSTRAP_ADMIN_LOGIN } });
  if (existing) {
    logger.info(`Пользователь "${env.BOOTSTRAP_ADMIN_LOGIN}" уже существует — пропуск`);
    return;
  }

  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    logger.warn(
      'BOOTSTRAP_ADMIN_PASSWORD не задан — учётная запись администратора не создана. ' +
        'Задайте переменную в .env и повторите pnpm db:seed.',
    );
    return;
  }

  const adminRole = await Role.findOne({ where: { code: 'admin' } });
  if (!adminRole) {
    throw new Error('Роль "admin" не найдена — сначала выполните сид ролей и прав');
  }

  const passwordHash = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD);
  await User.create({
    login: env.BOOTSTRAP_ADMIN_LOGIN,
    passwordHash,
    fullName: 'Администратор системы',
    roleId: adminRole.id,
  });

  logger.info(`Создан пользователь-администратор "${env.BOOTSTRAP_ADMIN_LOGIN}"`);
}
