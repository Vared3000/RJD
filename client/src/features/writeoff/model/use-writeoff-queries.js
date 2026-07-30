import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { writeoffApi } from '../api/writeoff-api.js';

const KEY = 'writeoff-documents';

export function useWriteoffList(warehouseId) {
  return useQuery({
    queryKey: [KEY, { warehouseId }],
    queryFn: () => writeoffApi.list({ warehouseId }),
  });
}

export function useWriteoffDocument(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => writeoffApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useWriteoffMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
    queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['instances'] });
  };

  const create = useMutation({ mutationFn: writeoffApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (payload) => writeoffApi.update(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: () => writeoffApi.remove(id), onSuccess: invalidate });
  const addLine = useMutation({
    mutationFn: (payload) => writeoffApi.addLine(id, payload),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId) => writeoffApi.removeLine(id, lineId),
    onSuccess: invalidate,
  });
  const post = useMutation({ mutationFn: () => writeoffApi.post(id), onSuccess: invalidate });

  return { create, update, remove, addLine, removeLine, post };
}
