import { useEffect } from 'react';
import { refreshSession } from '../../../shared/api/http-client.js';

// Access-токен живёт только в памяти, поэтому при перезагрузке страницы
// сессию нужно молча восстановить через refresh-cookie (httpOnly).
// refreshSession() — общий лок с интерцептором httpClient (см. его
// комментарий): без него параллельный refresh отсюда и из интерцептора
// (например, из-за двойного вызова эффектов React.StrictMode в dev)
// разлогинивал пользователя, хотя сессия успешно обновлялась.
export function useBootstrapSession() {
  useEffect(() => {
    refreshSession().catch(() => {});
  }, []);
}
