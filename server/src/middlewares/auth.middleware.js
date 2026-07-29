import { verifyAccessToken } from '../utils/tokens.js';
import { ApiError } from '../utils/api-error.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized());
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.user = payload;
    return next();
  } catch {
    return next(ApiError.unauthorized('Токен недействителен или истёк'));
  }
}
