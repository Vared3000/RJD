import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function generateRefreshTokenValue() {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function refreshTtlToDate(from = new Date()) {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_TTL);
  if (!match) {
    throw new Error(`Некорректный формат JWT_REFRESH_TTL: ${env.JWT_REFRESH_TTL}`);
  }
  const [, amountStr, unit] = match;
  const amount = Number(amountStr);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return new Date(from.getTime() + amount * unitMs);
}
