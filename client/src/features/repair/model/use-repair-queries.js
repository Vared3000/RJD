import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repairApi } from '../api/repair-api.js';

const KEY = 'repair-documents';

export function useRepairList(warehouseId) {
  return useQuery({
    queryKey: [KEY, { warehouseId }],
    queryFn: () => repairApi.list({ warehouseId }),
  });
}

export function useRepairDocument(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => repairApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useRepairMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
    queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['instances'] });
  };

  const create = useMutation({ mutationFn: repairApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (payload) => repairApi.update(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: () => repairApi.remove(id), onSuccess: invalidate });
  const addLine = useMutation({
    mutationFn: (payload) => repairApi.addLine(id, payload),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId) => repairApi.removeLine(id, lineId),
    onSuccess: invalidate,
  });
  const send = useMutation({ mutationFn: () => repairApi.send(id), onSuccess: invalidate });
  const complete = useMutation({
    mutationFn: (payload) => repairApi.complete(id, payload),
    onSuccess: invalidate,
  });

  return { create, update, remove, addLine, removeLine, send, complete };
}
