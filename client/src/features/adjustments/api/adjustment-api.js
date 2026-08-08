import { httpClient } from '../../../shared/api/http-client.js';

const BASE = '/adjustments/documents';

export const adjustmentApi = {
  async list({ warehouseId } = {}) {
    const { data } = await httpClient.get(BASE, {
      params: warehouseId ? { warehouseId } : undefined,
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
  async createFromInventory(inventoryDocumentId, payload) {
    const { data } = await httpClient.post(
      `${BASE}/from-inventory/${inventoryDocumentId}`,
      payload,
    );
    return data.data;
  },
  async update(id, payload) {
    const { data } = await httpClient.patch(`${BASE}/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    await httpClient.delete(`${BASE}/${id}`);
  },
  async addLine(id, payload) {
    const { data } = await httpClient.post(`${BASE}/${id}/lines`, payload);
    return data.data;
  },
  async updateLine(id, lineId, payload) {
    const { data } = await httpClient.patch(`${BASE}/${id}/lines/${lineId}`, payload);
    return data.data;
  },
  async removeLine(id, lineId) {
    const { data } = await httpClient.delete(`${BASE}/${id}/lines/${lineId}`);
    return data.data;
  },
  async post(id) {
    const { data } = await httpClient.post(`${BASE}/${id}/post`);
    return data.data;
  },
};
