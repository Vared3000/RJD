import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../api/tasks-api.js';

const KEY = 'issuance-tasks';

export function useTasksList(status) {
  return useQuery({
    queryKey: [KEY, { status }],
    queryFn: () => tasksApi.list({ status }),
  });
}

// Бейдж-счётчик в меню (см. nav-sections.js/AppLayout.jsx) — опрашивается
// периодически, чтобы отражать задачи, созданные в других вкладках/другими
// пользователями, а не только после мутаций в текущей сессии.
export function useOpenTasksCount(enabled) {
  return useQuery({
    queryKey: [KEY, 'count'],
    queryFn: () => tasksApi.countOpen(),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useTasksMutations() {
  const queryClient = useQueryClient();
  // Складские остатки/движения здесь не инвалидируются — "Оформить довыдачу"
  // только создаёт черновик, остатки меняются позже, при штатном "Провести"
  // (см. use-issuance-queries.js — та мутация уже инвалидирует их сама).
  const createDraft = useMutation({
    mutationFn: (taskIds) => tasksApi.createDraft(taskIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ['issuance-documents'] });
    },
    meta: { successMessage: 'Черновик довыдачи создан' },
  });
  return { createDraft };
}
