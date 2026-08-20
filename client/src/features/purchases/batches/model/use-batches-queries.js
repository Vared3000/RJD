import { useQuery } from '@tanstack/react-query';
import { batchesApi } from '../api/batches-api.js';

export function useBatches(params) {
  const query = useQuery({
    queryKey: ['batches', params],
    queryFn: () => batchesApi.list(params),
  });
  return { ...query, data: query.data?.items, meta: query.data?.meta };
}

export function useBatch(id, params) {
  const query = useQuery({
    queryKey: ['batches', id, params],
    queryFn: () => batchesApi.getOne(id, params),
    enabled: Boolean(id),
  });
  return { ...query, data: query.data?.item, meta: query.data?.meta };
}
