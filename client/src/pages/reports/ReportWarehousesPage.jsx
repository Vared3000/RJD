import { useState } from 'react';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { ReportTable } from '../../features/reports/ui/ReportTable.jsx';
import { ReportExportButtons } from '../../features/reports/ui/ReportExportButtons.jsx';
import { useWarehousesReport } from '../../features/reports/model/use-reports-queries.js';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './ReportsPage.module.css';

const columns = [
  { key: 'warehouseName', label: 'Склад' },
  { key: 'incoming', label: 'Поступления (движений)' },
  { key: 'outgoing', label: 'Выбытия (движений)' },
  { key: 'balanceQuantity', label: 'Остаток, шт.' },
];

const totalColumns = [
  { key: 'label', label: '', render: () => 'Итого' },
  { key: 'incoming', label: '', render: (t) => t.incoming },
  { key: 'outgoing', label: '', render: (t) => t.outgoing },
  { key: 'balanceQuantity', label: '', render: (t) => t.balanceQuantity },
];

export function ReportWarehousesPage() {
  const [range, setRange] = useState(() => resolvePreset('month'));
  const [warehouseId, setWarehouseId] = useState('');
  const { data: warehouses } = createCatalogHooks('warehouses').useList(false);
  const { data, isLoading } = useWarehousesReport({
    ...range,
    warehouseId: warehouseId || undefined,
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Отчёт: Склады</h1>
      </div>

      <div className={pageStyles.filters}>
        <PeriodFilter from={range.from} to={range.to} onChange={setRange} />
        <Select
          label="Склад"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
          options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
      </div>

      <ReportExportButtons
        report="warehouses"
        params={{ ...range, warehouseId: warehouseId || undefined }}
      />
      <ReportTable
        columns={columns}
        rows={data?.rows}
        isLoading={isLoading}
        totals={data?.totals}
        totalColumns={totalColumns}
      />
    </div>
  );
}
