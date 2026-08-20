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
  async turnover(params) {
    const { data } = await httpClient.get('/reports/turnover', {
      params: pruneParams(params ?? {}),
    });
    return {
      rows: data.data,
      totals: data.meta?.totals,
      from: data.meta?.from,
      to: data.meta?.to,
      groupBy: data.meta?.groupBy,
      groupByLabel: data.meta?.groupByLabel,
      filtersText: data.meta?.filtersText,
      formulaText: data.meta?.formulaText,
      positionNote: data.meta?.positionNote,
      incompleteHireCount: data.meta?.incompleteHireCount ?? 0,
      generatedAt: data.meta?.generatedAt,
    };
  },
};

export async function downloadReport(report, params, format) {
  const response = await httpClient.get(`/reports/${report}/export`, {
    params: pruneParams({ ...params, format }),
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] ?? '';
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${report}.${format}`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
