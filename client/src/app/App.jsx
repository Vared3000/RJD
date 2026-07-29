import { AppProviders } from './providers/AppProviders.jsx';
import { AppRouter } from './router.jsx';
import { useBootstrapSession } from '../features/auth/model/use-bootstrap-session.js';
import { useSessionStore } from '../shared/session/session-store.js';

function SessionGate({ children }) {
  useBootstrapSession();
  const status = useSessionStore((state) => state.status);

  if (status === 'loading') {
    return null;
  }
  return children;
}

export function App() {
  return (
    <AppProviders>
      <SessionGate>
        <AppRouter />
      </SessionGate>
    </AppProviders>
  );
}
