import { httpClient } from '../../../shared/api/http-client.js';

export const instanceApi = {
  async getOne(id) {
    const { data } = await httpClient.get(`/instances/${id}`);
    return data.data;
  },

  async getHistory(id) {
    const { data } = await httpClient.get(`/instances/${id}/history`);
    return data.data;
  },
};
