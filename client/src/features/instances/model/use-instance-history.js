import { useQuery } from '@tanstack/react-query';
import { instanceApi } from '../api/instance-api.js';

export function useInstance(id) {
  return useQuery({
    queryKey: ['instances', id],
    queryFn: () => instanceApi.getOne(id),
    enabled: Boolean(id),
  });
}

export function useInstanceHistory(id) {
  return useQuery({
    queryKey: ['instances', id, 'history'],
    queryFn: () => instanceApi.getHistory(id),
    enabled: Boolean(id),
  });
}
