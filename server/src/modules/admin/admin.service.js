import { sequelize } from '../../database/models/index.js';
import { adminRepository } from './admin.repository.js';
import { authRepository } from '../auth/auth.repository.js';
import { ApiError } from '../../utils/api-error.js';
import { hashPassword } from '../../utils/password.js';

function hasAdminPermission(roleWithPermissions) {
  return (roleWithPermissions?.permissions ?? []).some((p) => p.code === 'admin.manage');
}

// "Последний активный администратор" — активный (isActive, не archived)
// пользователь, чья роль даёт admin.manage, а не только роль с кодом
// 'admin': кастомная роль с этим правом тоже считается. Проверяется перед
// любым изменением, которое могло бы убрать этот статус у пользователя
// (блокировка или смена роли на роль без admin.manage).
async function assertNotLastActiveAdmin(
  { userId, wasCountedAdmin, willBeCountedAdmin },
  { transaction },
) {
  if (!wasCountedAdmin || willBeCountedAdmin) return;
  const adminRoleIds = await adminRepository.findAdminRoleIds({ transaction });
  const remaining = await adminRepository.countActiveUsersInRoles(adminRoleIds, {
    excludeUserId: userId,
    transaction,
  });
  if (remaining === 0) {
    throw ApiError.badRequest(
      'Нельзя убрать права последнего активного администратора — сначала назначьте другого',
    );
  }
}

export const adminService = {
  list(options) {
    return adminRepository.list(options);
  },

  async getById(id) {
    const user = await adminRepository.findById(id);
    if (!user) throw ApiError.notFound('Пользователь не найден');
    return user;
  },

  async create(data, { userId: performedByUserId }) {
    const existing = await adminRepository.findByLogin(data.login);
    if (existing) throw ApiError.conflict('Пользователь с таким логином уже существует');

    let createdId;
    await sequelize.transaction(async (transaction) => {
      const passwordHash = await hashPassword(data.password);
      const user = await adminRepository.create(
        {
          login: data.login,
          passwordHash,
          fullName: data.fullName,
          roleId: data.roleId,
        },
        { transaction },
      );
      createdId = user.id;
      await adminRepository.createEvent(
        {
          userId: user.id,
          eventType: 'create',
          toRoleId: data.roleId,
          performedByUserId,
          occurredAt: new Date(),
          details: { login: data.login },
        },
        { transaction },
      );
    });
    return adminRepository.findById(createdId);
  },

  async update(id, data, { userId: performedByUserId }) {
    if (data.isActive === false && id === performedByUserId) {
      throw ApiError.badRequest('Нельзя заблокировать самого себя');
    }

    await sequelize.transaction(async (transaction) => {
      const current = await adminRepository.findByIdForUpdate(id, { transaction });
      if (!current) throw ApiError.notFound('Пользователь не найден');

      const currentRole = await adminRepository.findRoleWithPermissions(current.roleId, {
        transaction,
      });
      const nextRole = data.roleId
        ? await adminRepository.findRoleWithPermissions(data.roleId, { transaction })
        : currentRole;
      if (data.roleId && !nextRole) throw ApiError.badRequest('Роль не найдена');

      const nextIsActive = data.isActive ?? current.isActive;
      const wasCountedAdmin = current.isActive && hasAdminPermission(currentRole);
      const willBeCountedAdmin = nextIsActive && hasAdminPermission(nextRole);

      await assertNotLastActiveAdmin(
        { userId: id, wasCountedAdmin, willBeCountedAdmin },
        { transaction },
      );

      await adminRepository.updateById(id, data, { transaction });

      const events = [];
      if (data.roleId && data.roleId !== current.roleId) {
        events.push({
          userId: id,
          eventType: 'role_change',
          fromRoleId: current.roleId,
          toRoleId: data.roleId,
          performedByUserId,
          occurredAt: new Date(),
          details: {},
        });
      }
      if (data.isActive !== undefined && data.isActive !== current.isActive) {
        events.push({
          userId: id,
          eventType: data.isActive ? 'unblock' : 'block',
          performedByUserId,
          occurredAt: new Date(),
          details: {},
        });
      }
      for (const event of events) {
        await adminRepository.createEvent(event, { transaction });
      }

      // Блокировка отзывает активные сессии (задача 6, правило "при
      // блокировке отзывать refresh-токены") — в той же транзакции, чтобы
      // блокировка и отзыв сессий были неразделимы.
      if (data.isActive === false && current.isActive) {
        await authRepository.revokeAllUserRefreshTokens(id, { transaction });
      }
    });

    return adminRepository.findById(id);
  },

  async resetPassword(id, { password }, { userId: performedByUserId }) {
    await sequelize.transaction(async (transaction) => {
      const current = await adminRepository.findByIdForUpdate(id, { transaction });
      if (!current) throw ApiError.notFound('Пользователь не найден');

      const passwordHash = await hashPassword(password);
      await adminRepository.updateById(id, { passwordHash }, { transaction });
      await adminRepository.createEvent(
        {
          userId: id,
          eventType: 'password_reset',
          performedByUserId,
          occurredAt: new Date(),
          details: {},
        },
        { transaction },
      );
    });
    return adminRepository.findById(id);
  },

  async revokeSessions(id, { userId: performedByUserId }) {
    const user = await adminRepository.findById(id);
    if (!user) throw ApiError.notFound('Пользователь не найден');

    await sequelize.transaction(async (transaction) => {
      await authRepository.revokeAllUserRefreshTokens(id, { transaction });
      await adminRepository.createEvent(
        {
          userId: id,
          eventType: 'sessions_revoked',
          performedByUserId,
          occurredAt: new Date(),
          details: {},
        },
        { transaction },
      );
    });
    return adminRepository.findById(id);
  },

  listRoles() {
    return adminRepository.listRoles();
  },

  listPermissions() {
    return adminRepository.listPermissions();
  },

  async getEvents(id) {
    const user = await adminRepository.findById(id);
    if (!user) throw ApiError.notFound('Пользователь не найден');
    return adminRepository.listEvents(id);
  },
};
