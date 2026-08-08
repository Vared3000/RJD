import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adjustmentApi } from '../api/adjustment-api.js';

const KEY = 'adjustment-documents';

export function useAdjustmentList(warehouseId) {
  return useQuery({
    queryKey: [KEY, { warehouseId }],
    queryFn: () => adjustmentApi.list({ warehouseId }),
  });
}

export function useAdjustmentDocument(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => adjustmentApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useAdjustmentMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
    queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['instances'] });
  };

  const create = useMutation({ mutationFn: adjustmentApi.create, onSuccess: invalidate });
  const createFromInventory = useMutation({
    mutationFn: ({ inventoryDocumentId, payload }) =>
      adjustmentApi.createFromInventory(inventoryDocumentId, payload),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (payload) => adjustmentApi.update(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: () => adjustmentApi.remove(id), onSuccess: invalidate });
  const addLine = useMutation({
    mutationFn: (payload) => adjustmentApi.addLine(id, payload),
    onSuccess: invalidate,
  });
  const updateLine = useMutation({
    mutationFn: ({ lineId, payload }) => adjustmentApi.updateLine(id, lineId, payload),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId) => adjustmentApi.removeLine(id, lineId),
    onSuccess: invalidate,
  });
  const post = useMutation({ mutationFn: () => adjustmentApi.post(id), onSuccess: invalidate });

  return { create, createFromInventory, update, remove, addLine, updateLine, removeLine, post };
}
