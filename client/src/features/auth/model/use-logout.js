import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth-api.js';
import { useSessionStore } from '../../../shared/session/session-store.js';

export function useLogout() {
  const clearSession = useSessionStore((state) => state.clearSession);

  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => clearSession(),
  });
}
