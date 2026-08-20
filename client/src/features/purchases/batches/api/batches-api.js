import { httpClient } from '../../../../shared/api/http-client.js';

const BASE = '/batches';

export const batchesApi = {
  async list(params) {
    const { data } = await httpClient.get(BASE, { params });
    return { items: data.data, meta: data.meta };
  },

  async getOne(id, params) {
    const { data } = await httpClient.get(`${BASE}/${id}`, { params });
    return { item: data.data, meta: data.meta };
  },
};
