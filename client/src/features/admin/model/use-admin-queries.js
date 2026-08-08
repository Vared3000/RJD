import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/admin-api.js';

const KEY = 'admin-users';

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

  const create = useMutation({ mutationFn: adminApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, payload }) => adminApi.update(id, payload),
    onSuccess: invalidate,
  });
  const resetPassword = useMutation({
    mutationFn: ({ id, payload }) => adminApi.resetPassword(id, payload),
    onSuccess: invalidate,
  });
  const revokeSessions = useMutation({
    mutationFn: (id) => adminApi.revokeSessions(id),
    onSuccess: invalidate,
  });

  return { create, update, resetPassword, revokeSessions };
}
