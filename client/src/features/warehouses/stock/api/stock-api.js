import { httpClient } from '../../../../shared/api/http-client.js';

export const stockApi = {
  async getBalances(params) {
    const { data } = await httpClient.get('/stock/balances', { params });
    return data.data;
  },
  async listMovements(params) {
    const { data } = await httpClient.get('/stock/movements', { params });
    return data.data;
  },
};
