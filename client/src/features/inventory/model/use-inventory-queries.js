import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../api/inventory-api.js';

const KEY = 'inventory-documents';

export function useInventoryList(warehouseId) {
  return useQuery({
    queryKey: [KEY, { warehouseId }],
    queryFn: () => inventoryApi.list({ warehouseId }),
  });
}

export function useInventoryDocument(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => inventoryApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useInventoryMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [KEY] });

  const create = useMutation({ mutationFn: inventoryApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (payload) => inventoryApi.update(id, payload),
    onSuccess: invalidate,
    meta: { successMessage: 'Шапка документа сохранена' },
  });
  const remove = useMutation({
    mutationFn: () => inventoryApi.remove(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Черновик удалён' },
  });
  const updateLine = useMutation({
    mutationFn: ({ lineId, payload }) => inventoryApi.updateLine(id, lineId, payload),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId) => inventoryApi.removeLine(id, lineId),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: () => inventoryApi.complete(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Инвентаризация завершена' },
  });

  return { create, update, remove, updateLine, removeLine, complete };
}
