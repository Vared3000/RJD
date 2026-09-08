import { useEffect, useState } from 'react';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import {
  downloadPrintForm,
  downloadMonthlyRentalVersion,
  previewMonthlyRental,
} from '../../features/print-forms/api/print-forms-api.js';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import { parseApiError, parseBlobApiError } from '../../shared/lib/parse-api-error.js';
import { MONTHLY_RENTAL_ACT_ENABLED } from '../../shared/config/features.js';
import { Button } from '../../shared/ui/Button.jsx';
import { SearchableSelect } from '../../shared/ui/SearchableSelect.jsx';
import { Select } from '../../shared/ui/Select.jsx';
import { TextField } from '../../shared/ui/TextField.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
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
    description: 'Передача одежды работникам с ФИО и табельными номерами.',
  },
  {
    code: 'personal-card',
    title: 'Личная карточка работника',
    description: 'Размеры, нормы, сроки использования, история выдачи и возврата одежды.',
  },
  {
    code: 'upd',
    title: 'УПД (статус 1)',
    description: 'Счёт-фактура и передаточный документ с товарами, ценами и НДС.',
    pdfOnly: true,
  },
];

export function PrintFormsPage() {
  const [range, setRange] = useState(() => resolvePreset('month'));
  const [dpoId, setDpoId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [debouncedEmployeeSearch, setDebouncedEmployeeSearch] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [rentalMonth, setRentalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rentalPreview, setRentalPreview] = useState(null);
  const [rentalReason, setRentalReason] = useState('');
  const [preservationDate, setPreservationDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const canReopenMonth = useSessionStore((state) =>
    state.user?.permissions?.includes('admin.manage'),
  );
  const { data: dpos } = createCatalogHooks('dpo').useList(false, { limit: 200 });
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedEmployeeSearch(employeeSearch), 250);
    return () => clearTimeout(timer);
  }, [employeeSearch]);
  const { data: employees, isFetching: employeesLoading } = createCatalogHooks('employees').useList(
    false,
    { search: debouncedEmployeeSearch, dpoId: dpoId || undefined, limit: 40 },
    { enabled: Boolean(dpoId) },
  );

  async function download(form, format) {
    if (form === 'personal-card' && !employeeId) {
      setError('Сначала выберите работника');
      return;
    }
    if (form !== 'personal-card' && !dpoId) {
      setError('Сначала выберите ДПО');
      return;
    }
    const key = `${form}:${format}`;
    setPending(key);
    setError('');
    try {
      await downloadPrintForm(form, { dpoId, employeeId, ...range, format });
    } catch (requestError) {
      setError(await parseBlobApiError(requestError));
    } finally {
      setPending('');
    }
  }

  async function previewRental() {
    if (!dpoId) {
      setError('Сначала выберите ДПО');
      return;
    }
    setPending('monthly-rental:preview');
    setError('');
    try {
      setRentalPreview(await previewMonthlyRental({ dpoId, month: rentalMonth }));
    } catch (requestError) {
      setError(parseApiError(requestError).message);
    } finally {
      setPending('');
    }
  }

  async function downloadRental(format) {
    if (!dpoId) {
      setError('Сначала выберите ДПО');
      return;
    }
    const key = `monthly-rental:${format}`;
    setPending(key);
    setError('');
    try {
      await downloadPrintForm('monthly-rental', {
        dpoId,
        month: rentalMonth,
        format,
        reason: rentalReason,
      });
      setRentalPreview(await previewMonthlyRental({ dpoId, month: rentalMonth }));
      setRentalReason('');
    } catch (requestError) {
      setError(await parseBlobApiError(requestError));
    } finally {
      setPending('');
    }
  }

  async function downloadRentalVersion(versionNumber, format) {
    const key = `monthly-rental:v${versionNumber}:${format}`;
    setPending(key);
    setError('');
    try {
      await downloadMonthlyRentalVersion(rentalPreview.actId, versionNumber, format);
    } catch (requestError) {
      setError(await parseBlobApiError(requestError));
    } finally {
      setPending('');
    }
  }

  async function downloadPreservationReceipt(format) {
    if (!dpoId) {
      setError('Сначала выберите ДПО');
      return;
    }
    const key = `preservation-receipt:${format}`;
    setPending(key);
    setError('');
    try {
      await downloadPrintForm('preservation-receipt', {
        dpoId,
        from: preservationDate,
        to: preservationDate,
        format,
      });
    } catch (requestError) {
      setError(await parseBlobApiError(requestError));
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
          onChange={(event) => {
            setDpoId(event.target.value);
            setEmployeeId('');
            setEmployeeSearch('');
          }}
          options={(dpos ?? []).map((dpo) => ({ value: dpo.id, label: dpo.name }))}
        />
        <SearchableSelect
          label="Работник"
          value={employeeId}
          onChange={setEmployeeId}
          onSearch={setEmployeeSearch}
          isLoading={employeesLoading}
          disabled={!dpoId}
          placeholder={dpoId ? 'Введите ФИО или табельный номер…' : 'Сначала выберите ДПО'}
          hint="Нужен только для личной карточки"
          options={(employees ?? []).map((employee) => ({
            value: employee.id,
            label: [employee.fullName, employee.personnelNumber].filter(Boolean).join(' · '),
          }))}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {MONTHLY_RENTAL_ACT_ENABLED && (
        <section className={`${styles.card} ${styles.monthlyCard}`}>
          <div>
            <h2>Ежемесячный акт аренды по ДПО</h2>
            <p>
              Все экземпляры, находившиеся у работников выбранного ДПО хотя бы один день месяца.
              Предпросмотр пересчитывается, а первое скачивание фиксирует состав, цены и реквизиты
              акта.
            </p>
          </div>
          <div className={styles.monthlyControls}>
            <label className={styles.monthField}>
              <span>Отчётный месяц</span>
              <input
                type="month"
                value={rentalMonth}
                onChange={(event) => {
                  setRentalMonth(event.target.value);
                  setRentalPreview(null);
                }}
              />
            </label>
            <Button onClick={previewRental} disabled={Boolean(pending)} variant="secondary">
              {pending === 'monthly-rental:preview' ? 'Расчёт…' : 'Предпросмотр'}
            </Button>
            <Button
              onClick={() => downloadRental('xlsx')}
              disabled={Boolean(pending) || (rentalPreview?.needsNewVersion && !canReopenMonth)}
            >
              {pending === 'monthly-rental:xlsx'
                ? 'Фиксация…'
                : rentalPreview?.needsNewVersion
                  ? `Зафиксировать версию ${rentalPreview.versionNumber + 1} и скачать Excel`
                  : rentalPreview?.finalized
                    ? 'Скачать текущий Excel'
                    : 'Зафиксировать и скачать Excel'}
            </Button>
            <Button
              onClick={() => downloadRental('pdf')}
              disabled={Boolean(pending) || (rentalPreview?.needsNewVersion && !canReopenMonth)}
              variant="secondary"
            >
              {pending === 'monthly-rental:pdf'
                ? 'Фиксация…'
                : rentalPreview?.needsNewVersion
                  ? `Зафиксировать версию ${rentalPreview.versionNumber + 1} и скачать PDF`
                  : rentalPreview?.finalized
                    ? 'Скачать текущий PDF'
                    : 'Зафиксировать и скачать PDF'}
            </Button>
          </div>
          {rentalPreview?.needsNewVersion && (
            <div className={styles.staleNotice}>
              <strong>Исходные документы изменились — требуется новая версия акта.</strong>
              <span>{rentalPreview.staleReason}</span>
              {canReopenMonth ? (
                <TextField
                  id="rentalRevisionReason"
                  label="Причина новой версии (необязательно)"
                  value={rentalReason}
                  onChange={(event) => setRentalReason(event.target.value)}
                />
              ) : (
                <span>Повторно зафиксировать закрытый месяц может только администратор.</span>
              )}
            </div>
          )}
          {rentalPreview && (
            <div className={styles.previewSummary}>
              <strong>
                {rentalPreview.finalized
                  ? `Акт зафиксирован · версия ${rentalPreview.versionNumber}`
                  : 'Предварительный расчёт'}
              </strong>
              <span>Работников: {rentalPreview.employeeGroups.length}</span>
              <span>Экземпляров/строк: {rentalPreview.rows.length}</span>
              <span>
                Итого с НДС: {Number(rentalPreview.totals.totalWithVat).toLocaleString('ru-RU')} ₽
              </span>
              {rentalPreview.warnings.length > 0 && (
                <span className={styles.warning}>
                  Предупреждений: {rentalPreview.warnings.length}
                </span>
              )}
            </div>
          )}
          {rentalPreview?.versions?.length > 0 && (
            <div className={styles.versionHistory}>
              <h3>История версий</h3>
              {rentalPreview.versions.map((version) => (
                <div className={styles.versionRow} key={version.id}>
                  <div>
                    <strong>Версия {version.versionNumber}</strong>
                    <span>{new Date(version.generatedAt).toLocaleString('ru-RU')}</span>
                    {version.reason && <span>{version.reason}</span>}
                  </div>
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      disabled={Boolean(pending)}
                      onClick={() => downloadRentalVersion(version.versionNumber, 'xlsx')}
                    >
                      Excel
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={Boolean(pending)}
                      onClick={() => downloadRentalVersion(version.versionNumber, 'pdf')}
                    >
                      PDF
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className={`${styles.card} ${styles.monthlyCard}`}>
        <div>
          <h2>Сохранная расписка</h2>
          <p>
            Список работников и форменной одежды из проведённых выдач выбранного ДПО за один день. В
            форме предусмотрено место для подписи каждого работника.
          </p>
        </div>
        <div className={styles.monthlyControls}>
          <label className={styles.monthField}>
            <span>Дата передачи</span>
            <input
              type="date"
              value={preservationDate}
              onChange={(event) => setPreservationDate(event.target.value)}
            />
          </label>
          <Button onClick={() => downloadPreservationReceipt('xlsx')} disabled={Boolean(pending)}>
            {pending === 'preservation-receipt:xlsx' ? 'Формирование…' : 'Скачать Excel'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadPreservationReceipt('pdf')}
            disabled={Boolean(pending)}
          >
            {pending === 'preservation-receipt:pdf' ? 'Формирование…' : 'Скачать PDF'}
          </Button>
        </div>
      </section>

      <div className={styles.grid}>
        {FORMS.map((form) => (
          <section key={form.code} className={styles.card}>
            <div>
              <h2>{form.title}</h2>
              <p>{form.description}</p>
            </div>
            <div className={styles.actions}>
              {!form.pdfOnly && (
                <Button onClick={() => download(form.code, 'xlsx')} disabled={Boolean(pending)}>
                  {pending === `${form.code}:xlsx` ? 'Формирование…' : 'Скачать Excel'}
                </Button>
              )}
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
