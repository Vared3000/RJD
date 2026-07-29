import { authRepository } from './auth.repository.js';
import { ApiError } from '../../utils/api-error.js';
import { verifyPassword } from '../../utils/password.js';
import {
  signAccessToken,
  generateRefreshTokenValue,
  hashToken,
  refreshTtlToDate,
} from '../../utils/tokens.js';

function toPublicUser(user) {
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    role: {
      code: user.role.code,
      name: user.role.name,
    },
    permissions: user.role.permissions.map((p) => p.code),
  };
}

function issueAccessToken(user) {
  return signAccessToken({
    sub: user.id,
    login: user.login,
    role: user.role.code,
    permissions: user.role.permissions.map((p) => p.code),
  });
}

async function issueRefreshToken(userId, ip) {
  const value = generateRefreshTokenValue();
  await authRepository.createRefreshToken({
    userId,
    tokenHash: hashToken(value),
    expiresAt: refreshTtlToDate(),
    createdByIp: ip,
  });
  return value;
}

export const authService = {
  async login({ login, password, ip }) {
    const user = await authRepository.findActiveUserByLogin(login);
    if (!user) {
      throw ApiError.unauthorized('Неверный логин или пароль');
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw ApiError.unauthorized('Неверный логин или пароль');
    }

    await authRepository.touchLastLogin(user.id);

    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id, ip);

    return { accessToken, refreshToken, user: toPublicUser(user) };
  },

  async refresh({ refreshTokenValue, ip }) {
    if (!refreshTokenValue) {
      throw ApiError.unauthorized('Отсутствует refresh-токен');
    }

    const tokenHash = hashToken(refreshTokenValue);
    const stored = await authRepository.findRefreshTokenByHash(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized('Сессия истекла, требуется повторный вход');
    }

    const user = await authRepository.findActiveUserById(stored.userId);
    if (!user) {
      throw ApiError.unauthorized('Пользователь не найден или заблокирован');
    }

    const newRefreshValue = generateRefreshTokenValue();
    const newToken = await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(newRefreshValue),
      expiresAt: refreshTtlToDate(),
      createdByIp: ip,
    });
    await authRepository.revokeRefreshToken(stored, { replacedById: newToken.id });

    const accessToken = issueAccessToken(user);

    return { accessToken, refreshToken: newRefreshValue, user: toPublicUser(user) };
  },

  async logout({ refreshTokenValue }) {
    if (!refreshTokenValue) return;
    const stored = await authRepository.findRefreshTokenByHash(hashToken(refreshTokenValue));
    if (stored && !stored.revokedAt) {
      await authRepository.revokeRefreshToken(stored);
    }
  },

  async getContext(userId) {
    const user = await authRepository.findActiveUserById(userId);
    if (!user) {
      throw ApiError.unauthorized('Пользователь не найден или заблокирован');
    }
    return toPublicUser(user);
  },
};
