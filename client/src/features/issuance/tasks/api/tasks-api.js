import { httpClient } from '../../../../shared/api/http-client.js';

const BASE = '/issuance/tasks';

export const tasksApi = {
  async list({ status } = {}) {
    const { data } = await httpClient.get(BASE, { params: { status, limit: 200 } });
    return data.data;
  },
  async countOpen() {
    const { data } = await httpClient.get(`${BASE}/count`);
    return data.data.count;
  },
  async complete(id) {
    const { data } = await httpClient.post(`${BASE}/${id}/complete`);
    return data.data;
  },
};
