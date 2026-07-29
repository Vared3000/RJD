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

let refreshPromise = null;

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
      if (!refreshPromise) {
        refreshPromise = httpClient.post('/auth/refresh').finally(() => {
          refreshPromise = null;
        });
      }
      const { data } = await refreshPromise;
      useSessionStore.getState().setSession(data.data);
      config.headers.Authorization = `Bearer ${data.data.accessToken}`;
      return httpClient(config);
    } catch (refreshError) {
      useSessionStore.getState().clearSession();
      return Promise.reject(refreshError);
    }
  },
);
