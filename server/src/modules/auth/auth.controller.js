import { authService } from './auth.service.js';
import { loginSchema } from './auth.validation.js';
import { success } from '../../utils/respond.js';
import { ApiError } from '../../utils/api-error.js';
import { useSecureCookies } from '../../config/env.js';
import { refreshTtlToDate } from '../../utils/tokens.js';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureCookies,
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshTtlToDate().getTime() - Date.now(),
  };
}

function setRefreshCookie(res, value) {
  res.cookie(REFRESH_COOKIE, value, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  const options = refreshCookieOptions();
  delete options.maxAge;
  res.clearCookie(REFRESH_COOKIE, options);
}

export const authController = {
  async login(req, res) {
    const { login, password } = loginSchema.parse(req.body);
    const { accessToken, refreshToken, user } = await authService.login({
      login,
      password,
      ip: req.ip,
    });
    setRefreshCookie(res, refreshToken);
    return success(res, { accessToken, user });
  },

  async refresh(req, res) {
    const refreshTokenValue = req.cookies?.[REFRESH_COOKIE];
    if (!refreshTokenValue) {
      throw ApiError.unauthorized('Отсутствует refresh-токен');
    }
    const { accessToken, refreshToken, user } = await authService.refresh({
      refreshTokenValue,
      ip: req.ip,
    });
    setRefreshCookie(res, refreshToken);
    return success(res, { accessToken, user });
  },

  async logout(req, res) {
    const refreshTokenValue = req.cookies?.[REFRESH_COOKIE];
    await authService.logout({ refreshTokenValue });
    clearRefreshCookie(res);
    return success(res, { loggedOut: true });
  },

  async me(req, res) {
    const user = await authService.getContext(req.user.sub);
    return success(res, { user });
  },
};
