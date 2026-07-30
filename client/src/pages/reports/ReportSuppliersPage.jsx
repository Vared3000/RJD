import { useState } from 'react';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { ReportTable } from '../../features/reports/ui/ReportTable.jsx';
import { useSuppliersReport } from '../../features/reports/model/use-reports-queries.js';
import { formatMoney } from '../../features/reports/model/format-money.js';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './ReportsPage.module.css';

const columns = [
  { key: 'supplierName', label: 'Поставщик' },
  { key: 'documentsCount', label: 'Документов' },
  { key: 'quantity', label: 'Количество' },
  { key: 'cost', label: 'Стоимость', render: (r) => formatMoney(r.cost) },
];

const totalColumns = [
  { key: 'label', label: '', render: () => 'Итого' },
  { key: 'documentsCount', label: '', render: (t) => t.documentsCount },
  { key: 'quantity', label: '', render: (t) => t.quantity },
  { key: 'cost', label: '', render: (t) => formatMoney(t.cost) },
];

export function ReportSuppliersPage() {
  const [range, setRange] = useState(() => resolvePreset('month'));
  const { data, isLoading } = useSuppliersReport(range);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Отчёт: Поставщики</h1>
      </div>

      <div className={pageStyles.filters}>
        <PeriodFilter from={range.from} to={range.to} onChange={setRange} />
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
