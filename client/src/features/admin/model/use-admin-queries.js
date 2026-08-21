import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/admin-api.js';

const KEY = 'admin-users';
const BACKUP_STATUS_KEY = 'admin-backup-status';

export function useBackupStatus(enabled) {
  return useQuery({
    queryKey: [BACKUP_STATUS_KEY],
    queryFn: () => adminApi.backupStatus(),
    enabled,
    refetchInterval: 5 * 60_000,
    meta: { silent: true },
  });
}

export function useAdminUsersList(filters) {
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => adminApi.list(filters),
  });
}

export function useAdminUserEvents(id) {
  return useQuery({
    queryKey: [KEY, id, 'events'],
    queryFn: () => adminApi.getEvents(id),
    enabled: Boolean(id),
  });
}

export function useAdminUserMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [KEY] });

  const create = useMutation({
    mutationFn: adminApi.create,
    onSuccess: invalidate,
    meta: { successMessage: 'Пользователь создан' },
  });
  const update = useMutation({
    mutationFn: ({ id, payload }) => adminApi.update(id, payload),
    onSuccess: invalidate,
    meta: { successMessage: 'Изменения сохранены' },
  });
  const resetPassword = useMutation({
    mutationFn: ({ id, payload }) => adminApi.resetPassword(id, payload),
    onSuccess: invalidate,
    meta: { successMessage: 'Пароль сброшен' },
  });
  const revokeSessions = useMutation({
    mutationFn: (id) => adminApi.revokeSessions(id),
    onSuccess: invalidate,
    meta: { successMessage: 'Сессии пользователя завершены' },
  });

  return { create, update, resetPassword, revokeSessions };
}
