import { useState } from 'react';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { ReportTable } from '../../features/reports/ui/ReportTable.jsx';
import { ReportExportButtons } from '../../features/reports/ui/ReportExportButtons.jsx';
import { useDpoReport } from '../../features/reports/model/use-reports-queries.js';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './ReportsPage.module.css';

const columns = [
  { key: 'dpoName', label: 'ДПО' },
  { key: 'employeesCount', label: 'Работников' },
  { key: 'issuedQuantityInPeriod', label: 'Выдано за период, шт.' },
  { key: 'coverageDaysInPeriod', label: 'Дни обеспечения за период' },
  { key: 'propertyItemsCount', label: 'На руках, шт.' },
];

const totalColumns = [
  { key: 'label', label: '', render: () => 'Итого' },
  { key: 'employeesCount', label: '', render: (t) => t.employeesCount },
  { key: 'issuedQuantityInPeriod', label: '', render: (t) => t.issuedQuantityInPeriod },
  { key: 'coverageDaysInPeriod', label: '', render: (t) => t.coverageDaysInPeriod },
  { key: 'propertyItemsCount', label: '', render: (t) => t.propertyItemsCount },
];

export function ReportDpoPage() {
  const [range, setRange] = useState(() => resolvePreset('month'));
  const [dpoId, setDpoId] = useState('');
  const { data: dpos } = createCatalogHooks('dpo').useList(false, { limit: 200 });
  const { data, isLoading } = useDpoReport({ ...range, dpoId: dpoId || undefined });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Отчёт: ДПО</h1>
      </div>

      <div className={pageStyles.filters}>
        <PeriodFilter from={range.from} to={range.to} onChange={setRange} />
        <Select
          label="ДПО"
          value={dpoId}
          onChange={(event) => setDpoId(event.target.value)}
          options={(dpos ?? []).map((d) => ({ value: d.id, label: d.name }))}
        />
      </div>

      <ReportExportButtons report="dpo" params={{ ...range, dpoId: dpoId || undefined }} />
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
