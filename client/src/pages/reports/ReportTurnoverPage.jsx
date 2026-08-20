import { useState } from 'react';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { ReportTable } from '../../features/reports/ui/ReportTable.jsx';
import { ReportExportButtons } from '../../features/reports/ui/ReportExportButtons.jsx';
import { useTurnoverReport } from '../../features/reports/model/use-reports-queries.js';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './ReportsPage.module.css';

// Отчёт «Сменяемость работников по ДПО» (Релиз Г,
// docs/TZ_NEXT_RELEASES_2026-08-19.md) — формула и предупреждения об
// ограничении данных приходят с сервера (turnover.service.js), фронтенд
// только отображает уже готовый текст, чтобы не разойтись с Excel/PDF.

const GENDER_OPTIONS = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
  { value: 'none', label: 'Не указан' },
];

const GROUP_BY_OPTIONS = [
  { value: 'dpo', label: 'По ДПО' },
  { value: 'position', label: 'По должности' },
  { value: 'gender', label: 'По полу' },
  { value: 'dpo_position_gender', label: 'ДПО + должность + пол' },
];

const SORT_OPTIONS = [
  { value: 'dpo', label: 'ДПО' },
  { value: 'position', label: 'Должность' },
  { value: 'gender', label: 'Пол' },
  { value: 'start', label: 'На начало' },
  { value: 'hired', label: 'Принято' },
  { value: 'terminated', label: 'Уволено' },
  { value: 'end', label: 'На конец' },
  { value: 'average', label: 'Средняя численность' },
  { value: 'turnoverRate', label: 'Сменяемость, %' },
  { value: 'turnoverPercent', label: 'Оборот кадров, %' },
];

function formatPercent(value) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDecimal(value) {
  return Number(value ?? 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const columns = [
  { key: 'dpoName', label: 'ДПО' },
  { key: 'positionName', label: 'Должность' },
  { key: 'genderLabel', label: 'Пол' },
  { key: 'start', label: 'На начало' },
  { key: 'hired', label: 'Принято' },
  { key: 'terminated', label: 'Уволено' },
  { key: 'end', label: 'На конец' },
  { key: 'average', label: 'Средняя численность', render: (r) => formatDecimal(r.average) },
  { key: 'turnoverRate', label: 'Сменяемость, %', render: (r) => formatPercent(r.turnoverRate) },
  {
    key: 'turnoverPercent',
    label: 'Оборот кадров, %',
    render: (r) => formatPercent(r.turnoverPercent),
  },
];

const totalColumns = [
  { key: 'label', label: '', render: () => 'Итого' },
  { key: 'positionName', label: '', render: () => '' },
  { key: 'genderLabel', label: '', render: () => '' },
  { key: 'start', label: '', render: (t) => t.start },
  { key: 'hired', label: '', render: (t) => t.hired },
  { key: 'terminated', label: '', render: (t) => t.terminated },
  { key: 'end', label: '', render: (t) => t.end },
  { key: 'average', label: '', render: (t) => formatDecimal(t.average) },
  { key: 'turnoverRate', label: '', render: (t) => formatPercent(t.turnoverRate) },
  { key: 'turnoverPercent', label: '', render: (t) => formatPercent(t.turnoverPercent) },
];

export function ReportTurnoverPage() {
  const [range, setRange] = useState(() => resolvePreset('month'));
  const [dpoId, setDpoId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [gender, setGender] = useState('');
  const [groupBy, setGroupBy] = useState('dpo');
  const [sort, setSort] = useState('');
  const [order, setOrder] = useState('ASC');

  const { data: dpos } = createCatalogHooks('dpo').useList(false, { limit: 200 });
  const { data: positions } = createCatalogHooks('positions').useList(false);

  const params = {
    ...range,
    dpoId: dpoId || undefined,
    positionId: positionId || undefined,
    gender: gender || undefined,
    groupBy,
    sort: sort || undefined,
    order,
  };
  const { data, isLoading } = useTurnoverReport(params);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Сменяемость работников по ДПО</h1>
      </div>

      <div className={pageStyles.filters}>
        <PeriodFilter from={range.from} to={range.to} onChange={setRange} />
        <Select
          label="ДПО"
          value={dpoId}
          onChange={(event) => setDpoId(event.target.value)}
          options={(dpos ?? []).map((d) => ({ value: d.id, label: d.name }))}
        />
        <Select
          label="Должность"
          value={positionId}
          onChange={(event) => setPositionId(event.target.value)}
          options={(positions ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <Select
          label="Пол"
          value={gender}
          onChange={(event) => setGender(event.target.value)}
          options={GENDER_OPTIONS}
        />
        <Select
          label="Группировка"
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value || 'dpo')}
          options={GROUP_BY_OPTIONS}
        />
        <Select
          label="Сортировка"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          options={SORT_OPTIONS}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOrder((current) => (current === 'ASC' ? 'DESC' : 'ASC'))}
          disabled={!sort}
        >
          {order === 'ASC' ? '↑ по возрастанию' : '↓ по убыванию'}
        </Button>
      </div>

      {data && (
        <p className={styles.hint}>
          {data.formulaText}
          {data.positionNote ? ` ${data.positionNote}` : ''}
        </p>
      )}
      {Boolean(data?.incompleteHireCount) && (
        <p className={styles.hint}>
          Без даты приёма: {data.incompleteHireCount} карточек — не учтены в показателе «Принято»,
          но могут входить в численность.
        </p>
      )}

      <ReportExportButtons report="turnover" params={params} />
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
