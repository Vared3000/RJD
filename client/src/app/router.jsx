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
import { NomenclatureModelsPage } from '../pages/nomenclature/NomenclatureModelsPage.jsx';
import { InstancesPage } from '../pages/nomenclature/InstancesPage.jsx';
import { ReceivingListPage } from '../pages/purchases/ReceivingListPage.jsx';
import { ReceivingEditorPage } from '../pages/purchases/ReceivingEditorPage.jsx';
import { StockBalancesPage } from '../pages/warehouses/StockBalancesPage.jsx';
import { StockMovementsPage } from '../pages/warehouses/StockMovementsPage.jsx';
import { EmployeesPage } from '../pages/employees/EmployeesPage.jsx';
import { EmployeeCardPage } from '../pages/employees/EmployeeCardPage.jsx';
import { KitsPage } from '../pages/employees/KitsPage.jsx';
import { IssuanceListPage } from '../pages/issuance/IssuanceListPage.jsx';
import { IssuanceEditorPage } from '../pages/issuance/IssuanceEditorPage.jsx';
import { ReturnListPage } from '../pages/issuance/ReturnListPage.jsx';
import { ReturnEditorPage } from '../pages/issuance/ReturnEditorPage.jsx';
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
        <Route path="nomenclature/models" element={<NomenclatureModelsPage />} />
        <Route path="nomenclature/instances" element={<InstancesPage />} />
        <Route path="purchases/receiving" element={<ReceivingListPage />} />
        <Route path="purchases/receiving/:id" element={<ReceivingEditorPage />} />
        <Route path="warehouses/balances" element={<StockBalancesPage />} />
        <Route path="warehouses/movements" element={<StockMovementsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/kits" element={<KitsPage />} />
        <Route path="employees/:id" element={<EmployeeCardPage />} />
        <Route path="issuance/documents" element={<IssuanceListPage />} />
        <Route path="issuance/documents/:id" element={<IssuanceEditorPage />} />
        <Route path="issuance/returns" element={<ReturnListPage />} />
        <Route path="issuance/returns/:id" element={<ReturnEditorPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
