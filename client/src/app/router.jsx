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
import { InstanceCardPage } from '../pages/nomenclature/InstanceCardPage.jsx';
import { BarcodeLabelsPage } from '../pages/nomenclature/BarcodeLabelsPage.jsx';
import { ReceivingListPage } from '../pages/purchases/ReceivingListPage.jsx';
import { ReceivingEditorPage } from '../pages/purchases/ReceivingEditorPage.jsx';
import { BatchesPage } from '../pages/purchases/BatchesPage.jsx';
import { BatchCardPage } from '../pages/purchases/BatchCardPage.jsx';
import { StockBalancesPage } from '../pages/warehouses/StockBalancesPage.jsx';
import { StockMovementsPage } from '../pages/warehouses/StockMovementsPage.jsx';
import { EmployeesPage } from '../pages/employees/EmployeesPage.jsx';
import { EmployeeCardPage } from '../pages/employees/EmployeeCardPage.jsx';
import { KitsPage } from '../pages/employees/KitsPage.jsx';
import { IssuanceListPage } from '../pages/issuance/IssuanceListPage.jsx';
import { IssuanceEditorPage } from '../pages/issuance/IssuanceEditorPage.jsx';
import { ReturnListPage } from '../pages/issuance/ReturnListPage.jsx';
import { ReturnEditorPage } from '../pages/issuance/ReturnEditorPage.jsx';
import { TasksPage } from '../pages/issuance/TasksPage.jsx';
import { LaundryListPage } from '../pages/laundry/LaundryListPage.jsx';
import { LaundryEditorPage } from '../pages/laundry/LaundryEditorPage.jsx';
import { RepairListPage } from '../pages/repair/RepairListPage.jsx';
import { RepairEditorPage } from '../pages/repair/RepairEditorPage.jsx';
import { TransferListPage } from '../pages/transfers/TransferListPage.jsx';
import { TransferEditorPage } from '../pages/transfers/TransferEditorPage.jsx';
import { WriteoffListPage } from '../pages/writeoff/WriteoffListPage.jsx';
import { WriteoffEditorPage } from '../pages/writeoff/WriteoffEditorPage.jsx';
import { InventoryListPage } from '../pages/inventory/InventoryListPage.jsx';
import { InventoryEditorPage } from '../pages/inventory/InventoryEditorPage.jsx';
import { AdjustmentListPage } from '../pages/adjustments/AdjustmentListPage.jsx';
import { AdjustmentEditorPage } from '../pages/adjustments/AdjustmentEditorPage.jsx';
import { ReportEmployeesPage } from '../pages/reports/ReportEmployeesPage.jsx';
import { ReportDpoPage } from '../pages/reports/ReportDpoPage.jsx';
import { ReportPurchasesPage } from '../pages/reports/ReportPurchasesPage.jsx';
import { ReportSuppliersPage } from '../pages/reports/ReportSuppliersPage.jsx';
import { ReportWriteoffsPage } from '../pages/reports/ReportWriteoffsPage.jsx';
import { ReportRepairsPage } from '../pages/reports/ReportRepairsPage.jsx';
import { ReportWarehousesPage } from '../pages/reports/ReportWarehousesPage.jsx';
import { ReportStockBalancesPage } from '../pages/reports/ReportStockBalancesPage.jsx';
import { ReportPropertyCostPage } from '../pages/reports/ReportPropertyCostPage.jsx';
import { ReportTurnoverPage } from '../pages/reports/ReportTurnoverPage.jsx';
import { DpoPage } from '../pages/dpo/DpoPage.jsx';
import { DpoHistoryPage } from '../pages/dpo/DpoHistoryPage.jsx';
import { PrintFormsPage } from '../pages/print-forms/PrintFormsPage.jsx';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage.jsx';
import { PrintFormSettingsPage } from '../pages/admin/PrintFormSettingsPage.jsx';
import { PrintFormTemplatesPage } from '../pages/admin/PrintFormTemplatesPage.jsx';
import { StartupImportPage } from '../pages/admin/StartupImportPage.jsx';
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
        <Route path="nomenclature/instances/:id" element={<InstanceCardPage />} />
        <Route path="nomenclature/barcodes" element={<BarcodeLabelsPage />} />
        <Route path="purchases/receiving" element={<ReceivingListPage />} />
        <Route path="purchases/receiving/:id" element={<ReceivingEditorPage />} />
        <Route path="purchases/batches" element={<BatchesPage />} />
        <Route path="purchases/batches/:id" element={<BatchCardPage />} />
        <Route path="warehouses/balances" element={<StockBalancesPage />} />
        <Route path="warehouses/movements" element={<StockMovementsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/kits" element={<KitsPage />} />
        <Route path="employees/:id" element={<EmployeeCardPage />} />
        <Route path="dpo" element={<DpoPage />} />
        <Route path="dpo/:id/history" element={<DpoHistoryPage />} />
        <Route path="issuance/documents" element={<IssuanceListPage />} />
        <Route path="issuance/documents/:id" element={<IssuanceEditorPage />} />
        <Route path="issuance/returns" element={<ReturnListPage />} />
        <Route path="issuance/returns/:id" element={<ReturnEditorPage />} />
        <Route path="issuance/tasks" element={<TasksPage />} />
        <Route path="laundry/documents" element={<LaundryListPage />} />
        <Route path="laundry/documents/:id" element={<LaundryEditorPage />} />
        <Route path="repair/documents" element={<RepairListPage />} />
        <Route path="repair/documents/:id" element={<RepairEditorPage />} />
        <Route path="transfers/documents" element={<TransferListPage />} />
        <Route path="transfers/documents/:id" element={<TransferEditorPage />} />
        <Route path="writeoff/documents" element={<WriteoffListPage />} />
        <Route path="writeoff/documents/:id" element={<WriteoffEditorPage />} />
        <Route path="inventory/documents" element={<InventoryListPage />} />
        <Route path="inventory/documents/:id" element={<InventoryEditorPage />} />
        <Route path="adjustments/documents" element={<AdjustmentListPage />} />
        <Route path="adjustments/documents/:id" element={<AdjustmentEditorPage />} />
        <Route path="reports/employees" element={<ReportEmployeesPage />} />
        <Route path="reports/dpo" element={<ReportDpoPage />} />
        <Route path="reports/purchases" element={<ReportPurchasesPage />} />
        <Route path="reports/suppliers" element={<ReportSuppliersPage />} />
        <Route path="reports/writeoffs" element={<ReportWriteoffsPage />} />
        <Route path="reports/repairs" element={<ReportRepairsPage />} />
        <Route path="reports/warehouses" element={<ReportWarehousesPage />} />
        <Route path="reports/stock-balances" element={<ReportStockBalancesPage />} />
        <Route path="reports/property-cost" element={<ReportPropertyCostPage />} />
        <Route path="reports/turnover" element={<ReportTurnoverPage />} />
        <Route path="print-forms" element={<PrintFormsPage />} />
        <Route path="admin/users" element={<AdminUsersPage />} />
        <Route path="admin/print-form-settings" element={<PrintFormSettingsPage />} />
        <Route path="admin/print-form-templates" element={<PrintFormTemplatesPage />} />
        <Route path="admin/startup-import" element={<StartupImportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
