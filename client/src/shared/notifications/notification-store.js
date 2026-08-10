import { create } from 'zustand';

// Тот же паттерн, что shared/session/session-store.js: стор читается и как
// хук (NotificationCenter), и через getState()/setState() вне React — это
// нужно для глобального onError/onSuccess в QueryClient, где хуков нет
// (см. app/providers/AppProviders.jsx).
export const useNotificationStore = create(() => ({ items: [] }));

const DURATION_BY_TYPE = { success: 5000, info: 5000, warning: 7000, error: 8000 };

export function dismissNotification(id) {
  useNotificationStore.setState((state) => ({
    items: state.items.filter((item) => item.id !== id),
  }));
}

function push(type, message) {
  if (!message) return;
  const id = crypto.randomUUID();
  useNotificationStore.setState((state) => ({ items: [...state.items, { id, type, message }] }));
  setTimeout(() => dismissNotification(id), DURATION_BY_TYPE[type]);
}

// Не хук — можно вызывать откуда угодно (мутации, QueryClient, обработчики
// вне компонентов), как useSessionStore.getState() в http-client.js.
export const notify = {
  success: (message) => push('success', message),
  error: (message) => push('error', message),
  warning: (message) => push('warning', message),
  info: (message) => push('info', message),
};
