import { models } from '../../database/models/index.js';

const { User, Role, Permission, RefreshToken } = models;

const userWithRoleInclude = {
  include: [{ model: Role, as: 'role', include: [{ model: Permission, as: 'permissions' }] }],
};

export const authRepository = {
  findActiveUserByLogin(login) {
    return User.findOne({
      where: { login, isActive: true, archivedAt: null },
      ...userWithRoleInclude,
    });
  },

  findActiveUserById(id) {
    return User.findOne({
      where: { id, isActive: true, archivedAt: null },
      ...userWithRoleInclude,
    });
  },

  touchLastLogin(userId) {
    return User.update({ lastLoginAt: new Date() }, { where: { id: userId } });
  },

  createRefreshToken({ userId, tokenHash, expiresAt, createdByIp }) {
    return RefreshToken.create({ userId, tokenHash, expiresAt, createdByIp });
  },

  findRefreshTokenByHash(tokenHash) {
    return RefreshToken.findOne({ where: { tokenHash } });
  },

  revokeRefreshToken(token, { replacedById } = {}) {
    return token.update({ revokedAt: new Date(), replacedById: replacedById ?? null });
  },

  revokeAllUserRefreshTokens(userId, { transaction } = {}) {
    return RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: null }, transaction },
    );
  },
};
