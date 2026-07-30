import { httpClient } from '../../../shared/api/http-client.js';

const BASE = '/employees';

export const employeeApi = {
  async getById(id) {
    const { data } = await httpClient.get(`${BASE}/${id}`);
    return data.data;
  },
  async getProperty(id) {
    const { data } = await httpClient.get(`${BASE}/${id}/property`);
    return data.data;
  },
};
