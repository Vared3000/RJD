import { httpClient } from '../../../shared/api/http-client.js';

const BASE = '/print-form-settings/parties';

export const printFormSettingsApi = {
  async list() {
    const { data } = await httpClient.get(BASE);
    return data.data;
  },
  async create(payload) {
    const { data } = await httpClient.post(BASE, payload);
    return data.data;
  },
};
