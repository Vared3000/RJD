import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { issuanceApi } from '../api/issuance-api.js';

const KEY = 'issuance-documents';

export function useIssuanceList(employeeId) {
  return useQuery({
    queryKey: [KEY, { employeeId }],
    queryFn: () => issuanceApi.list({ employeeId }),
  });
}

export function useIssuanceDocument(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => issuanceApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useIssuanceMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
    queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
  };

  const create = useMutation({ mutationFn: issuanceApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (payload) => issuanceApi.update(id, payload),
    onSuccess: invalidate,
    meta: { successMessage: 'Шапка документа сохранена' },
  });
  const remove = useMutation({
    mutationFn: () => issuanceApi.remove(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Черновик удалён' },
  });
  const addLine = useMutation({
    mutationFn: (payload) => issuanceApi.addLine(id, payload),
    onSuccess: invalidate,
  });
  const updateLine = useMutation({
    mutationFn: ({ lineId, payload }) => issuanceApi.updateLine(id, lineId, payload),
    onSuccess: invalidate,
  });
  const removeLine = useMutation({
    mutationFn: (lineId) => issuanceApi.removeLine(id, lineId),
    onSuccess: invalidate,
  });
  const applyKit = useMutation({
    mutationFn: (season) => issuanceApi.applyKit(id, season),
    onSuccess: invalidate,
  });
  const previewKit = useMutation({
    mutationFn: (season) => issuanceApi.previewKit(id, season),
  });
  const post = useMutation({
    mutationFn: () => issuanceApi.post(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Документ проведён' },
  });

  return { create, update, remove, addLine, updateLine, removeLine, applyKit, previewKit, post };
}
