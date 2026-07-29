import { ApiError } from '../utils/api-error.js';

export function requirePermission(code) {
  return (req, _res, next) => {
    if (!req.user?.permissions?.includes(code)) {
      return next(ApiError.forbidden(`Требуется право "${code}"`));
    }
    return next();
  };
}
