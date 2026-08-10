import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { laundryApi } from '../api/laundry-api.js';

const KEY = 'laundry-documents';

export function useLaundryList(warehouseId) {
  return useQuery({
    queryKey: [KEY, { warehouseId }],
    queryFn: () => laundryApi.list({ warehouseId }),
  });
}

export function useLaundryDocument(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => laundryApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useLaundryMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
    queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['instances'] });
  };

  const create = useMutation({ mutationFn: laundryApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (payload) => laundryApi.update(id, payload),
    onSuccess: invalidate,
    meta: { successMessage: 'Шапка документа сохранена' },
  });
  const remove = useMutation({
    mutationFn: () => laundryApi.remove(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Черновик удалён' },
  });
  const addLine = useMutation({
    mutationFn: (payload) => laundryApi.addLine(id, payload),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId) => laundryApi.removeLine(id, lineId),
    onSuccess: invalidate,
  });
  const send = useMutation({
    mutationFn: () => laundryApi.send(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Документ отправлен' },
  });
  const complete = useMutation({
    mutationFn: (payload) => laundryApi.complete(id, payload),
    onSuccess: invalidate,
    meta: { successMessage: 'Стирка завершена' },
  });

  return { create, update, remove, addLine, removeLine, send, complete };
}
