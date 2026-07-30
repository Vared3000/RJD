import { useState } from 'react';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { ReportTable } from '../../features/reports/ui/ReportTable.jsx';
import { useRepairsReport } from '../../features/reports/model/use-reports-queries.js';
import { formatMoney } from '../../features/reports/model/format-money.js';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './ReportsPage.module.css';

const columns = [
  { key: 'number', label: 'Номер' },
  {
    key: 'completedAt',
    label: 'Завершён',
    render: (r) => (r.completedAt ? new Date(r.completedAt).toLocaleDateString('ru-RU') : '—'),
  },
  { key: 'warehouseName', label: 'Склад' },
  { key: 'itemsCount', label: 'Позиций' },
  { key: 'cost', label: 'Стоимость ремонта', render: (r) => formatMoney(r.cost) },
];

const totalColumns = [
  { key: 'label', label: '', render: () => 'Итого' },
  { key: 'blank1', label: '', render: () => '' },
  { key: 'blank2', label: '', render: () => '' },
  { key: 'itemsCount', label: '', render: (t) => t.itemsCount },
  { key: 'cost', label: '', render: (t) => formatMoney(t.cost) },
];

export function ReportRepairsPage() {
  const [range, setRange] = useState(() => resolvePreset('month'));
  const [warehouseId, setWarehouseId] = useState('');
  const { data: warehouses } = createCatalogHooks('warehouses').useList(false);
  const { data, isLoading } = useRepairsReport({ ...range, warehouseId: warehouseId || undefined });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Отчёт: Ремонты</h1>
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
