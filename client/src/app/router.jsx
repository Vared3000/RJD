import { Navigate, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '../shared/session/session-store.js';
import { LoginPage } from '../pages/login/LoginPage.jsx';
import { DashboardPage } from '../pages/dashboard/DashboardPage.jsx';
import { AppLayout } from '../widgets/layout/AppLayout.jsx';

function RequireAuth({ children }) {
  const status = useSessionStore((state) => state.status);

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
