import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../api/reports-api.js';

function useReport(key, fetcher, params) {
  return useQuery({
    queryKey: ['reports', key, params],
    queryFn: () => fetcher(params),
  });
}

export const useStockBalancesReport = (params) =>
  useReport('stock-balances', reportsApi.stockBalances, params);
export const usePropertyCostReport = (params) =>
  useReport('property-cost', reportsApi.propertyCost, params);
export const usePurchasesReport = (params) => useReport('purchases', reportsApi.purchases, params);
export const useSuppliersReport = (params) => useReport('suppliers', reportsApi.suppliers, params);
export const useWriteoffsReport = (params) => useReport('writeoffs', reportsApi.writeoffs, params);
export const useRepairsReport = (params) => useReport('repairs', reportsApi.repairs, params);
export const useWarehousesReport = (params) =>
  useReport('warehouses', reportsApi.warehouses, params);
export const useEmployeesReport = (params) => useReport('employees', reportsApi.employees, params);
export const useDpoReport = (params) => useReport('dpo', reportsApi.dpo, params);
export const useTurnoverReport = (params) => useReport('turnover', reportsApi.turnover, params);
