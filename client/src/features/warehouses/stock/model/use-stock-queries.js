import { useQuery } from '@tanstack/react-query';
import { stockApi } from '../api/stock-api.js';

export function useStockBalances(filters) {
  return useQuery({
    queryKey: ['stock-balances', filters],
    queryFn: () => stockApi.getBalances(filters),
  });
}

export function useStockMovements(filters) {
  return useQuery({
    queryKey: ['stock-movements', filters],
    queryFn: () => stockApi.listMovements(filters),
  });
}
