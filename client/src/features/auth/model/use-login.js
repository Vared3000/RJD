import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth-api.js';
import { useSessionStore } from '../../../shared/session/session-store.js';

export function useLogin() {
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => setSession(data),
  });
}
