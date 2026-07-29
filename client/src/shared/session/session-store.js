import { create } from 'zustand';

// status: 'loading' (проверка сессии при старте) | 'authenticated' | 'guest'
export const useSessionStore = create((set) => ({
  user: null,
  accessToken: null,
  status: 'loading',
  setSession: ({ user, accessToken }) => set({ user, accessToken, status: 'authenticated' }),
  clearSession: () => set({ user: null, accessToken: null, status: 'guest' }),
}));

export function getAccessToken() {
  return useSessionStore.getState().accessToken;
}

export function hasPermission(code) {
  return Boolean(useSessionStore.getState().user?.permissions?.includes(code));
}
