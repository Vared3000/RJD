import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { returnApi } from '../api/return-api.js';

const KEY = 'issuance-returns';

export function useReturnList(employeeId) {
  return useQuery({
    queryKey: [KEY, { employeeId }],
    queryFn: () => returnApi.list({ employeeId }),
  });
}

export function useReturnDocument(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => returnApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useAvailableInstances(employeeId) {
  return useQuery({
    queryKey: [KEY, 'available', employeeId],
    queryFn: () => returnApi.availableInstances(employeeId),
    enabled: Boolean(employeeId),
  });
}

export function useReturnMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
    queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
  };

  const create = useMutation({ mutationFn: returnApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (payload) => returnApi.update(id, payload),
    onSuccess: invalidate,
    meta: { successMessage: 'Шапка документа сохранена' },
  });
  const remove = useMutation({
    mutationFn: () => returnApi.remove(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Черновик удалён' },
  });
  const addLine = useMutation({
    mutationFn: (payload) => returnApi.addLine(id, payload),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId) => returnApi.removeLine(id, lineId),
    onSuccess: invalidate,
  });
  const post = useMutation({
    mutationFn: () => returnApi.post(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Документ проведён' },
  });

  return { create, update, remove, addLine, removeLine, post };
}
