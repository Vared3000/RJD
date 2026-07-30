import { httpClient } from '../../../shared/api/http-client.js';

function pruneParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
}

async function getReport(path, params) {
  const { data } = await httpClient.get(`/reports/${path}`, { params: pruneParams(params ?? {}) });
  return { rows: data.data, totals: data.meta?.totals, from: data.meta?.from, to: data.meta?.to };
}

export const reportsApi = {
  stockBalances: (params) => getReport('stock-balances', params),
  propertyCost: (params) => getReport('property-cost', params),
  purchases: (params) => getReport('purchases', params),
  suppliers: (params) => getReport('suppliers', params),
  writeoffs: (params) => getReport('writeoffs', params),
  repairs: (params) => getReport('repairs', params),
  warehouses: (params) => getReport('warehouses', params),
  employees: (params) => getReport('employees', params),
  dpo: (params) => getReport('dpo', params),
};
