import { useState } from 'react';
import { ReportTable } from '../../features/reports/ui/ReportTable.jsx';
import { usePropertyCostReport } from '../../features/reports/model/use-reports-queries.js';
import { formatMoney } from '../../features/reports/model/format-money.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './ReportsPage.module.css';

const columns = [
  { key: 'employeeName', label: 'Работник' },
  { key: 'dpoName', label: 'ДПО', render: (r) => r.dpoName ?? '—' },
  { key: 'itemsCount', label: 'Предметов' },
  { key: 'cost', label: 'Стоимость', render: (r) => formatMoney(r.cost) },
  { key: 'employeeCost', label: 'Для работника', render: (r) => formatMoney(r.employeeCost) },
];

const totalColumns = [
  { key: 'label', label: '', render: () => 'Итого' },
  { key: 'blank1', label: '', render: () => '' },
  { key: 'itemsCount', label: '', render: (t) => t.itemsCount },
  { key: 'cost', label: '', render: (t) => formatMoney(t.cost) },
  { key: 'employeeCost', label: '', render: (t) => formatMoney(t.employeeCost) },
];

export function ReportPropertyCostPage() {
  const [dpoId, setDpoId] = useState('');
  const { data: dpos } = createCatalogHooks('dpo').useList(false);
  const { data, isLoading } = usePropertyCostReport({ dpoId: dpoId || undefined });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Отчёт: Стоимость имущества</h1>
      </div>

      <div className={pageStyles.filters}>
        <Select
          label="ДПО"
          value={dpoId}
          onChange={(event) => setDpoId(event.target.value)}
          options={(dpos ?? []).map((d) => ({ value: d.id, label: d.name }))}
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
