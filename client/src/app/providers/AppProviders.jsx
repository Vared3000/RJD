import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { parseApiError } from '../../shared/lib/parse-api-error.js';
import { notify } from '../../shared/notifications/notification-store.js';
import { NotificationCenter } from '../../shared/notifications/NotificationCenter.jsx';

// Единая обработка ошибок (задача 20 плана): любой упавший запрос/мутация
// показывает toast без правки каждого места вызова — opt-out через
// meta: { silent: true } для случаев, где ошибка уже показана иначе.
// Успех — наоборот opt-in через meta: { successMessage }, чтобы не заводить
// шум на 90+ мутациях, у которых сейчас нет текста уведомления.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent) return;
      notify.error(parseApiError(error).message);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent) return;
      notify.error(mutation.meta?.errorMessage || parseApiError(error).message);
    },
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.meta?.successMessage) notify.success(mutation.meta.successMessage);
    },
  }),
});

export function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationCenter />
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}
