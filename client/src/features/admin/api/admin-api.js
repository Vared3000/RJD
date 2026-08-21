import { httpClient } from '../../../shared/api/http-client.js';

const BASE = '/admin/users';

export const adminApi = {
  async backupStatus() {
    const { data } = await httpClient.get('/admin/backup-status');
    return data.data;
  },
  async haStatus() {
    const { data } = await httpClient.get('/admin/ha-status');
    return data.data;
  },
  async list({ search, roleId, isActive } = {}) {
    const { data } = await httpClient.get(BASE, {
      params: {
        search: search || undefined,
        roleId: roleId || undefined,
        isActive: isActive === undefined ? undefined : String(isActive),
      },
    });
    return data.data;
  },
  async getById(id) {
    const { data } = await httpClient.get(`${BASE}/${id}`);
    return data.data;
  },
  async create(payload) {
    const { data } = await httpClient.post(BASE, payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await httpClient.patch(`${BASE}/${id}`, payload);
    return data.data;
  },
  async resetPassword(id, payload) {
    const { data } = await httpClient.post(`${BASE}/${id}/reset-password`, payload);
    return data.data;
  },
  async revokeSessions(id) {
    const { data } = await httpClient.post(`${BASE}/${id}/revoke-sessions`);
    return data.data;
  },
  async getEvents(id) {
    const { data } = await httpClient.get(`${BASE}/${id}/events`);
    return data.data;
  },
};
