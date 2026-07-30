import { useQuery } from '@tanstack/react-query';
import { dpoApi } from '../api/dpo-api.js';

export function useDpo(id) {
  return useQuery({ queryKey: ['dpo', id], queryFn: () => dpoApi.getOne(id), enabled: !!id });
}

export function useDpoHistory(id) {
  return useQuery({
    queryKey: ['dpo', id, 'history'],
    queryFn: () => dpoApi.getHistory(id),
    enabled: !!id,
  });
}
