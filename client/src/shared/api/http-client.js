import axios from 'axios';
import { API_URL, HA_RECONNECT_ENABLED } from '../config/env.js';
import { useSessionStore, getAccessToken } from '../session/session-store.js';

export const httpClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export const HA_CONNECTION_EVENT = 'workwear:ha-connection-state';
const HA_RETRY_WINDOW_MS = 120_000;
const retryableMethods = new Set(['get', 'head', 'options']);

function publishConnectionState(state) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HA_CONNECTION_EVENT, { detail: { state } }));
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

httpClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

httpClient.interceptors.response.use(
  (response) => {
    if (HA_RECONNECT_ENABLED) publishConnectionState('connected');
    return response;
  },
  async (error) => {
    const { config, response } = error;
    const transient = !response || [502, 503, 504].includes(response.status);
    if (!HA_RECONNECT_ENABLED || !config || !transient) return Promise.reject(error);

    publishConnectionState('reconnecting');
    const method = String(config.method ?? 'get').toLowerCase();
    // Mutations are never retried here: until a transactional idempotency ledger
    // exists, a lost response has an unknown outcome and an automatic retry can
    // duplicate a document or stock movement.
    if (!retryableMethods.has(method)) return Promise.reject(error);

    const startedAt = config._haRetryStartedAt ?? Date.now();
    const elapsed = Date.now() - startedAt;
    if (elapsed >= HA_RETRY_WINDOW_MS) return Promise.reject(error);
    const attempt = (config._haRetryAttempt ?? 0) + 1;
    const delay = Math.min(500 * 2 ** Math.min(attempt - 1, 4), 5000, HA_RETRY_WINDOW_MS - elapsed);
    await wait(delay);
    return httpClient({
      ...config,
      _haRetryStartedAt: startedAt,
      _haRetryAttempt: attempt,
    });
  },
);

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
