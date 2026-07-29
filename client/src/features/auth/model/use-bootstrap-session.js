import { useEffect } from 'react';
import { authApi } from '../api/auth-api.js';
import { useSessionStore } from '../../../shared/session/session-store.js';

// Access-токен живёт только в памяти, поэтому при перезагрузке страницы
// сессию нужно молча восстановить через refresh-cookie (httpOnly).
export function useBootstrapSession() {
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);

  useEffect(() => {
    let cancelled = false;

    authApi
      .refresh()
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
