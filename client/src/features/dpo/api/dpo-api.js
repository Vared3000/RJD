import { httpClient } from '../../../shared/api/http-client.js';

export const dpoApi = {
  async getOne(id) {
    const { data } = await httpClient.get(`/dpo/${id}`);
    return data.data;
  },

  async getHistory(id) {
    const { data } = await httpClient.get(`/dpo/${id}/history`);
    return data.data;
  },
};
