import { useState } from 'react';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { ReportTable } from '../../features/reports/ui/ReportTable.jsx';
import { usePurchasesReport } from '../../features/reports/model/use-reports-queries.js';
import { formatMoney } from '../../features/reports/model/format-money.js';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './ReportsPage.module.css';

const columns = [
  { key: 'number', label: 'Номер' },
  { key: 'documentDate', label: 'Дата' },
  { key: 'supplierName', label: 'Поставщик' },
  { key: 'warehouseName', label: 'Склад' },
  { key: 'quantity', label: 'Количество' },
  { key: 'cost', label: 'Стоимость', render: (r) => formatMoney(r.cost) },
  { key: 'employeeCost', label: 'Для работника', render: (r) => formatMoney(r.employeeCost) },
];

const totalColumns = [
  { key: 'label', label: '', render: () => 'Итого' },
  { key: 'blank1', label: '', render: () => '' },
  { key: 'blank2', label: '', render: () => '' },
  { key: 'blank3', label: '', render: () => '' },
  { key: 'quantity', label: '', render: (t) => t.quantity },
  { key: 'cost', label: '', render: (t) => formatMoney(t.cost) },
  { key: 'employeeCost', label: '', render: (t) => formatMoney(t.employeeCost) },
];

export function ReportPurchasesPage() {
  const [range, setRange] = useState(() => resolvePreset('month'));
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const { data: suppliers } = createCatalogHooks('suppliers').useList(false);
  const { data: warehouses } = createCatalogHooks('warehouses').useList(false);
  const { data, isLoading } = usePurchasesReport({
    ...range,
    supplierId: supplierId || undefined,
    warehouseId: warehouseId || undefined,
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Отчёт: Закупки</h1>
      </div>

      <div className={pageStyles.filters}>
        <PeriodFilter from={range.from} to={range.to} onChange={setRange} />
        <Select
          label="Поставщик"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
          options={(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          label="Склад"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
          options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
      </div>

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
