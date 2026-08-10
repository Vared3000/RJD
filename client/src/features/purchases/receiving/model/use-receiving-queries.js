import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { receivingApi } from '../api/receiving-api.js';

const KEY = 'purchases-receiving';

export function useReceivingList() {
  return useQuery({ queryKey: [KEY], queryFn: receivingApi.list });
}

export function useReceivingDocument(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => receivingApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useReceivingMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
  };

  const create = useMutation({ mutationFn: receivingApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (payload) => receivingApi.update(id, payload),
    onSuccess: invalidate,
    meta: { successMessage: 'Шапка документа сохранена' },
  });
  const remove = useMutation({
    mutationFn: () => receivingApi.remove(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Черновик удалён' },
  });
  const addLine = useMutation({
    mutationFn: (payload) => receivingApi.addLine(id, payload),
    onSuccess: invalidate,
  });
  const updateLine = useMutation({
    mutationFn: ({ lineId, payload }) => receivingApi.updateLine(id, lineId, payload),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId) => receivingApi.removeLine(id, lineId),
    onSuccess: invalidate,
  });
  const post = useMutation({
    mutationFn: () => receivingApi.post(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Документ проведён' },
  });

  return { create, update, remove, addLine, updateLine, removeLine, post };
}
