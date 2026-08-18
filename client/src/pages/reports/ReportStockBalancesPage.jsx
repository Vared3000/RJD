import { useState } from 'react';
import { ReportTable } from '../../features/reports/ui/ReportTable.jsx';
import { ReportExportButtons } from '../../features/reports/ui/ReportExportButtons.jsx';
import { useStockBalancesReport } from '../../features/reports/model/use-reports-queries.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './ReportsPage.module.css';

const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

function formatSize(size) {
  if (!size) return '—';
  return `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`;
}

const columns = [
  { key: 'warehouse', label: 'Склад', render: (r) => r.warehouse?.name ?? '—' },
  { key: 'model', label: 'Модель', render: (r) => r.model?.name ?? '—' },
  { key: 'size', label: 'Размер', render: (r) => formatSize(r.size) },
  { key: 'heightSize', label: 'Рост', render: (r) => r.heightSize?.value ?? '—' },
  { key: 'quantity', label: 'Количество' },
];

const totalColumns = [
  { key: 'label', label: '', render: () => 'Итого' },
  { key: 'blank1', label: '', render: () => '' },
  { key: 'blank2', label: '', render: () => '' },
  { key: 'blank3', label: '', render: () => '' },
  { key: 'quantity', label: '', render: (t) => t.quantity },
];

export function ReportStockBalancesPage() {
  const [warehouseId, setWarehouseId] = useState('');
  const { data: warehouses } = createCatalogHooks('warehouses').useList(false);
  const { data, isLoading } = useStockBalancesReport({ warehouseId: warehouseId || undefined });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Отчёт: Остатки</h1>
      </div>

      <div className={pageStyles.filters}>
        <Select
          label="Склад"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
          options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
      </div>

      <ReportExportButtons
        report="stock-balances"
        params={{ warehouseId: warehouseId || undefined }}
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
