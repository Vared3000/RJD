import { httpClient } from '../../../shared/api/http-client.js';

export function createCatalogApi(resource) {
  const basePath = `/${resource}`;

  return {
    async list({ includeArchived = false, search } = {}) {
      const { data } = await httpClient.get(basePath, {
        params: { includeArchived: includeArchived || undefined, search: search || undefined },
      });
      return data.data;
    },

    async create(payload) {
      const { data } = await httpClient.post(basePath, payload);
      return data.data;
    },

    async update(id, payload) {
      const { data } = await httpClient.put(`${basePath}/${id}`, payload);
      return data.data;
    },

    async archive(id) {
      await httpClient.delete(`${basePath}/${id}`);
    },

    async restore(id) {
      await httpClient.patch(`${basePath}/${id}/restore`);
    },
  };
}
