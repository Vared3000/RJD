import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startupImportApi } from '../../features/startup-import/api/startup-import-api.js';
import { mutationErrorMessage, parseApiError } from '../../shared/lib/parse-api-error.js';
import { Button } from '../../shared/ui/Button.jsx';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './StartupImportPage.module.css';

function formatDate(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function Summary({ summary }) {
  if (!summary) return null;
  const cards = [
    ['ДПО', summary.dpos?.rows ?? 0, summary.dpos?.duplicates ?? 0],
    ['Номенклатура', summary.models?.rows ?? 0, summary.models?.duplicates ?? 0],
    ['Работники', summary.employees?.rows ?? 0, summary.employees?.duplicates ?? 0],
    ['Остатки, единиц', summary.balances?.units ?? 0, summary.balances?.duplicates ?? 0],
  ];
  return (
    <div className={styles.summaryGrid}>
      {cards.map(([label, value, duplicates]) => (
        <div className={styles.summaryCard} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>дублей: {duplicates}</small>
        </div>
      ))}
      <div className={`${styles.summaryCard} ${summary.errors ? styles.errorCard : styles.okCard}`}>
        <span>Результат проверки</span>
        <strong>{summary.errors ? `${summary.errors} ошибок` : 'Готово'}</strong>
        <small>предупреждений: {summary.warnings ?? 0}</small>
      </div>
    </div>
  );
}

export function StartupImportPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const runsQuery = useQuery({ queryKey: ['startup-import-runs'], queryFn: startupImportApi.list });
  const previewMutation = useMutation({
    mutationFn: () => startupImportApi.preview(inputRef.current.files[0]),
    onSuccess: (run) => {
      setPreview(run);
      queryClient.invalidateQueries({ queryKey: ['startup-import-runs'] });
    },
    meta: { successMessage: 'Файл проверен, сводка готова' },
  });
  const applyMutation = useMutation({
    mutationFn: (id) => startupImportApi.apply(id),
    onSuccess: (run) => {
      setPreview(run);
      queryClient.invalidateQueries({ queryKey: ['startup-import-runs'] });
    },
    meta: { successMessage: 'Стартовые данные применены' },
  });

  function submit(event) {
    event.preventDefault();
    setPreview(null);
    if (inputRef.current?.files[0]) previewMutation.mutate();
  }

  async function downloadTemplate() {
    setDownloadError('');
    try {
      await startupImportApi.downloadTemplate();
    } catch (error) {
      setDownloadError(parseApiError(error).message);
    }
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Стартовый импорт</h1>
          <p className={styles.subtitle}>
            Безопасная загрузка ДПО, номенклатуры, работников и согласованных начальных остатков.
            Сначала система только проверяет файл — база меняется после отдельного подтверждения.
          </p>
        </div>
        <Button variant="secondary" onClick={downloadTemplate}>
          Скачать шаблон Excel
        </Button>
      </div>

      <form className={styles.panel} onSubmit={submit}>
        <div>
          <h2>1. Проверить файл</h2>
          <p>Заполните шаблон, затем выберите его здесь. Максимальный размер — 10 МБ.</p>
        </div>
        <div className={styles.fileRow}>
          <input ref={inputRef} type="file" accept=".xlsx" required />
          <Button type="submit" disabled={previewMutation.isPending}>
            {previewMutation.isPending ? 'Проверяем…' : 'Загрузить и проверить'}
          </Button>
        </div>
        {downloadError && <p className={catalogStyles.formError}>{downloadError}</p>}
        {previewMutation.isError && (
          <p className={catalogStyles.formError}>{mutationErrorMessage(previewMutation)}</p>
        )}
      </form>

      {preview && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>2. Проверить сводку и протокол</h2>
              <p>{preview.fileName}</p>
            </div>
            {preview.status === 'previewed' && (
              <Button
                disabled={!preview.summary?.canApply || applyMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Применить проверенные стартовые данные? Операция выполняется один раз.',
                    )
                  ) {
                    applyMutation.mutate(preview.id);
                  }
                }}
              >
                {applyMutation.isPending ? 'Применяем…' : 'Применить данные'}
              </Button>
            )}
          </div>
          <Summary summary={preview.summary} />
          {applyMutation.isError && (
            <p className={catalogStyles.formError}>{mutationErrorMessage(applyMutation)}</p>
          )}
          {preview.status === 'applied' && (
            <div className={styles.applied}>Импорт применён {formatDate(preview.appliedAt)}</div>
          )}
          <div className={styles.protocol}>
            {(preview.protocol ?? []).length === 0 ? (
              <p className={styles.emptyProtocol}>Замечаний нет.</p>
            ) : (
              (preview.protocol ?? []).map((item, index) => (
                <div
                  className={item.level === 'error' ? styles.protocolError : styles.protocolWarning}
                  key={`${item.location}-${index}`}
                >
                  <strong>{item.location}</strong>
                  <span>{item.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className={styles.historyTitle}>Последние проверки</h2>
        <div className={catalogStyles.tableWrap}>
          <table className={catalogStyles.table}>
            <thead>
              <tr>
                <th>Файл</th>
                <th>Проверен</th>
                <th>Ошибки</th>
                <th>Статус</th>
                <th>Применён</th>
              </tr>
            </thead>
            <tbody>
              {runsQuery.data?.map((run) => (
                <tr key={run.id}>
                  <td>{run.fileName}</td>
                  <td>{formatDate(run.createdAt)}</td>
                  <td>{run.summary?.errors ?? 0}</td>
                  <td>{run.status === 'applied' ? 'Применён' : 'Только проверен'}</td>
                  <td>{formatDate(run.appliedAt)}</td>
                </tr>
              ))}
              {!runsQuery.isLoading && runsQuery.data?.length === 0 && (
                <tr>
                  <td colSpan="5" className={catalogStyles.hint}>
                    Проверок ещё нет
                  </td>
                </tr>
              )}
              {runsQuery.isError && (
                <tr>
                  <td colSpan="5" className={catalogStyles.formError}>
                    {parseApiError(runsQuery.error).message}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
