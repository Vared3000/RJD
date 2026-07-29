import { Navigate, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '../shared/session/session-store.js';
import { LoginPage } from '../pages/login/LoginPage.jsx';
import { DashboardPage } from '../pages/dashboard/DashboardPage.jsx';
import { OrganizationsPage } from '../pages/catalogs/OrganizationsPage.jsx';
import { SubdivisionsPage } from '../pages/catalogs/SubdivisionsPage.jsx';
import { PositionsPage } from '../pages/catalogs/PositionsPage.jsx';
import { WarehousesPage } from '../pages/catalogs/WarehousesPage.jsx';
import { SuppliersPage } from '../pages/catalogs/SuppliersPage.jsx';
import { SizesPage } from '../pages/catalogs/SizesPage.jsx';
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
        <Route path="catalogs/organizations" element={<OrganizationsPage />} />
        <Route path="catalogs/subdivisions" element={<SubdivisionsPage />} />
        <Route path="catalogs/positions" element={<PositionsPage />} />
        <Route path="catalogs/warehouses" element={<WarehousesPage />} />
        <Route path="catalogs/suppliers" element={<SuppliersPage />} />
        <Route path="catalogs/sizes" element={<SizesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
