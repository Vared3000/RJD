import { useState } from 'react';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { downloadPrintForm } from '../../features/print-forms/api/print-forms-api.js';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import { Button } from '../../shared/ui/Button.jsx';
import { Select } from '../../shared/ui/Select.jsx';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './PrintFormsPage.module.css';

const FORMS = [
  {
    code: 'fpu-26',
    title: 'ФПУ-26',
    description: 'Акт выполненных работ: номенклатура, количество, цена и НДС.',
  },
  {
    code: 'appendix-1-5',
    title: 'Приложение 1.5',
    description: 'Обеспечение форменной одеждой по должностям и дням.',
  },
  {
    code: 'appendix-1-7',
    title: 'Приложение 1.7',
    description: 'Передача одежды работникам с ФИО, табельными и инвентарными номерами.',
  },
];

export function PrintFormsPage() {
  const [range, setRange] = useState(() => resolvePreset('month'));
  const [dpoId, setDpoId] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const { data: dpos } = createCatalogHooks('dpo').useList(false);

  async function download(form, format) {
    if (!dpoId) {
      setError('Сначала выберите ДПО');
      return;
    }
    const key = `${form}:${format}`;
    setPending(key);
    setError('');
    try {
      await downloadPrintForm(form, { dpoId, ...range, format });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ??
          'Не удалось сформировать файл. Проверьте период и реквизиты ДПО.',
      );
    } finally {
      setPending('');
    }
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Печатные формы</h1>
          <p className={styles.subtitle}>
            Формы создаются по проведённым выдачам, а для импортированных периодов — по архивным
            актам. Реквизиты ДПО восстанавливаются на дату окончания периода.
          </p>
        </div>
      </div>

      <div className={styles.filters}>
        <PeriodFilter from={range.from} to={range.to} onChange={setRange} />
        <Select
          label="ДПО"
          value={dpoId}
          onChange={(event) => setDpoId(event.target.value)}
          options={(dpos ?? []).map((dpo) => ({ value: dpo.id, label: dpo.name }))}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.grid}>
        {FORMS.map((form) => (
          <section key={form.code} className={styles.card}>
            <div>
              <h2>{form.title}</h2>
              <p>{form.description}</p>
            </div>
            <div className={styles.actions}>
              <Button onClick={() => download(form.code, 'xlsx')} disabled={Boolean(pending)}>
                {pending === `${form.code}:xlsx` ? 'Формирование…' : 'Скачать Excel'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => download(form.code, 'pdf')}
                disabled={Boolean(pending)}
              >
                {pending === `${form.code}:pdf` ? 'Формирование…' : 'Скачать PDF'}
              </Button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
