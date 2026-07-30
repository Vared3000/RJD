import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { transferApi } from '../api/transfer-api.js';

const KEY = 'transfer-documents';

export function useTransferList(warehouseId) {
  return useQuery({
    queryKey: [KEY, { warehouseId }],
    queryFn: () => transferApi.list({ warehouseId }),
  });
}

export function useTransferDocument(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => transferApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useTransferMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
    queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['instances'] });
  };

  const create = useMutation({ mutationFn: transferApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (payload) => transferApi.update(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: () => transferApi.remove(id), onSuccess: invalidate });
  const addLine = useMutation({
    mutationFn: (payload) => transferApi.addLine(id, payload),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId) => transferApi.removeLine(id, lineId),
    onSuccess: invalidate,
  });
  const post = useMutation({ mutationFn: () => transferApi.post(id), onSuccess: invalidate });

  return { create, update, remove, addLine, removeLine, post };
}
