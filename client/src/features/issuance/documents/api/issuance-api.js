import { httpClient } from '../../../../shared/api/http-client.js';

const BASE = '/issuance/documents';

export const issuanceApi = {
  async list({ employeeId } = {}) {
    const { data } = await httpClient.get(BASE, {
      params: employeeId ? { employeeId } : undefined,
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
  async applyKit(id, season) {
    const { data } = await httpClient.post(`${BASE}/${id}/apply-kit`, { season });
    return { document: data.data, skipped: data.meta?.skipped ?? [] };
  },
  async previewKit(id, season) {
    const { data } = await httpClient.get(`${BASE}/${id}/kit-preview`, { params: { season } });
    return data.data;
  },
  async post(id) {
    const { data } = await httpClient.post(`${BASE}/${id}/post`);
    return data.data;
  },
};
