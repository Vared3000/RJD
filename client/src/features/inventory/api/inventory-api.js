import { httpClient } from '../../../shared/api/http-client.js';

const BASE = '/inventory/documents';

function withSummary(response) {
  return { ...response.data.data, summary: response.data.meta?.summary };
}

export const inventoryApi = {
  async list({ warehouseId } = {}) {
    const { data } = await httpClient.get(BASE, {
      params: warehouseId ? { warehouseId } : undefined,
    });
    return data.data;
  },
  async getById(id) {
    return withSummary(await httpClient.get(`${BASE}/${id}`));
  },
  async create(payload) {
    return withSummary(await httpClient.post(BASE, payload));
  },
  async update(id, payload) {
    return withSummary(await httpClient.patch(`${BASE}/${id}`, payload));
  },
  async remove(id) {
    await httpClient.delete(`${BASE}/${id}`);
  },
  async updateLine(id, lineId, payload) {
    return withSummary(await httpClient.patch(`${BASE}/${id}/lines/${lineId}`, payload));
  },
  async removeLine(id, lineId) {
    return withSummary(await httpClient.delete(`${BASE}/${id}/lines/${lineId}`));
  },
  async complete(id) {
    return withSummary(await httpClient.post(`${BASE}/${id}/complete`));
  },
};
