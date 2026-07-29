import { httpClient } from '../../../shared/api/http-client.js';

export const authApi = {
  async login({ login, password }) {
    const { data } = await httpClient.post('/auth/login', { login, password });
    return data.data;
  },

  async refresh() {
    const { data } = await httpClient.post('/auth/refresh');
    return data.data;
  },

  async logout() {
    await httpClient.post('/auth/logout');
  },
};
