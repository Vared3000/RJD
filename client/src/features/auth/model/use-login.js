import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth-api.js';
import { useSessionStore } from '../../../shared/session/session-store.js';

export function useLogin() {
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => setSession(data),
    // Ошибка уже показывается инлайн прямо под формой (LoginForm.jsx) —
    // глобальный тост здесь был бы дублирующим шумом на самом заметном месте.
    meta: { silent: true },
  });
}
