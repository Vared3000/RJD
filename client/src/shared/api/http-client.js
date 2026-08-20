import axios from 'axios';
import { API_URL } from '../config/env.js';
import { useSessionStore, getAccessToken } from '../session/session-store.js';

export const httpClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

httpClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Общий лок на весь /auth/refresh: и интерцептор при 401, и useBootstrapSession
// при монтировании приложения должны переиспользовать один и тот же запрос,
// иначе два параллельных refresh-запроса используют один и тот же
// httpOnly-cookie, backend ротирует токен по первому же и отклоняет второй —
// второй вызов молча разлогинивает пользователя, хотя первый уже успешно
// обновил сессию (воспроизводится в dev из-за двойного вызова эффектов
// React.StrictMode).
let refreshPromise = null;

export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = httpClient
      .post('/auth/refresh')
      .then(({ data }) => {
        useSessionStore.getState().setSession(data.data);
        return data.data;
      })
      .catch((refreshError) => {
        useSessionStore.getState().clearSession();
        throw refreshError;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function isAuthEndpoint(url = '') {
  return url.includes('/auth/login') || url.includes('/auth/refresh');
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    if (response?.status !== 401 || !config || config._retried || isAuthEndpoint(config.url)) {
      return Promise.reject(error);
    }

    config._retried = true;

    try {
      const data = await refreshSession();
      config.headers.Authorization = `Bearer ${data.accessToken}`;
      return httpClient(config);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);
