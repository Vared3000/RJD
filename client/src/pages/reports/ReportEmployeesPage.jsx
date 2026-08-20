import { useState } from 'react';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { ReportTable } from '../../features/reports/ui/ReportTable.jsx';
import { ReportExportButtons } from '../../features/reports/ui/ReportExportButtons.jsx';
import { useEmployeesReport } from '../../features/reports/model/use-reports-queries.js';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './ReportsPage.module.css';

const columns = [
  { key: 'fullName', label: 'ФИО' },
  { key: 'dpoName', label: 'ДПО', render: (r) => r.dpoName ?? '—' },
  { key: 'hireDate', label: 'Дата приёма' },
  { key: 'terminationDate', label: 'Дата увольнения', render: (r) => r.terminationDate ?? '—' },
  { key: 'tenureDays', label: 'Стаж, дн.' },
  { key: 'coverageDaysInPeriod', label: 'Дни обеспечения за период' },
  { key: 'propertyItemsCount', label: 'Выдано предметов' },
];

const totalColumns = [
  { key: 'label', label: '', render: () => 'Итого' },
  { key: 'dpoName', label: '', render: () => '' },
  { key: 'hireDate', label: '', render: () => '' },
  { key: 'terminationDate', label: '', render: () => '' },
  { key: 'tenureDays', label: '', render: () => '' },
  { key: 'coverageDaysInPeriod', label: '', render: (t) => t.coverageDaysInPeriod },
  { key: 'propertyItemsCount', label: '', render: (t) => t.propertyItemsCount },
];

export function ReportEmployeesPage() {
  const [range, setRange] = useState(() => resolvePreset('month'));
  const [dpoId, setDpoId] = useState('');
  const { data: dpos } = createCatalogHooks('dpo').useList(false, { limit: 200 });
  const { data, isLoading } = useEmployeesReport({ ...range, dpoId: dpoId || undefined });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Отчёт: Работники</h1>
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

      <ReportExportButtons report="employees" params={{ ...range, dpoId: dpoId || undefined }} />
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
