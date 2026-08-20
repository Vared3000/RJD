import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { printFormTemplatesApi } from '../../features/print-form-templates/api/print-form-templates-api.js';
import { TemplateVisualEditor } from '../../features/print-form-templates/ui/TemplateVisualEditor.jsx';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { PeriodFilter } from '../../features/reports/ui/PeriodFilter.jsx';
import { resolvePreset } from '../../features/reports/model/period-presets.js';
import {
  mutationErrorMessage as errorMessage,
  parseApiError,
  parseBlobApiError,
} from '../../shared/lib/parse-api-error.js';
import { Button } from '../../shared/ui/Button.jsx';
import { Select } from '../../shared/ui/Select.jsx';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './PrintFormTemplatesPage.module.css';

const FORM_TYPES = [
  { value: 'fpu-26', label: 'ФПУ-26' },
  { value: 'preservation-receipt', label: 'Сохранная расписка' },
];

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

export function PrintFormTemplatesPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState(() => resolvePreset('month'));
  const [dpoId, setDpoId] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [formType, setFormType] = useState(FORM_TYPES[0].value);
  const [editorVersion, setEditorVersion] = useState(null);
  const fileInputRef = useRef(null);

  const { data: dpos } = createCatalogHooks('dpo').useList(false, { limit: 200 });
  const versionsQuery = useQuery({
    queryKey: ['print-form-templates', formType],
    queryFn: () => printFormTemplatesApi.list(formType),
  });
  const { data: versions, isLoading } = versionsQuery;

  const upload = useMutation({
    mutationFn: () =>
      printFormTemplatesApi.upload(formType, {
        file: fileInputRef.current.files[0],
        dpoId,
        from: range.from,
        to: range.to,
        comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-form-templates', formType] });
      setComment('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    meta: { successMessage: 'Версия шаблона загружена и проверена' },
  });

  const activate = useMutation({
    mutationFn: (id) => printFormTemplatesApi.activate(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['print-form-templates', formType] }),
    meta: { successMessage: 'Версия активирована' },
  });

  function submitUpload(event) {
    event.preventDefault();
    setError('');
    if (!fileInputRef.current?.files[0]) {
      setError('Выберите файл .xlsx');
      return;
    }
    if (!dpoId) {
      setError('Выберите ДПО для пробной генерации');
      return;
    }
    upload.mutate();
  }

  async function runAction(key, action) {
    setPending(key);
    setError('');
    try {
      await action();
    } catch (requestError) {
      setError(await parseBlobApiError(requestError));
    } finally {
      setPending('');
    }
  }

  if (editorVersion) {
    return (
      <TemplateVisualEditor
        version={editorVersion}
        dpoId={dpoId}
        from={range.from}
        to={range.to}
        onClose={() => setEditorVersion(null)}
        onSaved={() => setEditorVersion(null)}
      />
    );
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Конструктор макетов печатных форм</h1>
          <p className={styles.subtitle}>
            Создайте свой макет на чистом листе или загрузите готовый Excel. Активная версия
            применяется при следующем формировании формы.
          </p>
        </div>
      </div>

      <section className={styles.quickGuide}>
        <div>
          <h2 className={styles.panelTitle}>Как создать свой шаблон</h2>
          <ol>
            <li>Выберите печатную форму, ДПО и период проверки.</li>
            <li>Нажмите «Создать свой макет» и оформите чистый лист A4.</li>
            <li>Выберите ячейку и добавляйте поля документа кнопками над таблицей.</li>
            <li>Сохраните версию, устраните показанные ошибки и проверьте Excel/PDF.</li>
            <li>Активируйте проверенную версию — только после этого она станет рабочей.</li>
          </ol>
        </div>
      </section>

      <form className={styles.uploadPanel} onSubmit={submitUpload}>
        <h2 className={styles.panelTitle}>Выберите форму и данные для проверки</h2>
        <p className={styles.hint}>
          ДПО и период нужны для пробной генерации — версия становится доступна для активации,
          только если по этим данным реально строится документ.
        </p>
        <div className={styles.uploadFields}>
          <Select
            label="Печатная форма"
            value={formType}
            onChange={(event) => {
              setFormType(event.target.value);
              setError('');
              setComment('');
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            options={FORM_TYPES}
          />
          <Select
            label="ДПО"
            value={dpoId}
            onChange={(event) => setDpoId(event.target.value)}
            options={(dpos ?? []).map((dpo) => ({ value: dpo.id, label: dpo.name }))}
          />
          <PeriodFilter from={range.from} to={range.to} onChange={setRange} />
        </div>
        <div className={catalogStyles.formActions}>
          <Button
            type="button"
            onClick={() => {
              setError('');
              if (!dpoId) {
                setError('Сначала выберите ДПО для проверки нового макета');
                return;
              }
              setEditorVersion({
                id: null,
                formType,
                versionNumber: null,
                isNew: true,
              });
            }}
          >
            Создать свой макет
          </Button>
        </div>
        <h2 className={styles.uploadTitle}>Или загрузить готовый Excel</h2>
        <div className={styles.uploadFields}>
          <label className={styles.fileField}>
            <span>Файл шаблона (.xlsx)</span>
            <input ref={fileInputRef} type="file" accept=".xlsx" />
          </label>
          <label className={styles.fileField}>
            <span>Комментарий</span>
            <input
              type="text"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Например: поправили формулировку акта"
            />
          </label>
        </div>
        <div className={catalogStyles.formActions}>
          <Button type="submit" disabled={upload.isPending}>
            {upload.isPending ? 'Загрузка и проверка…' : 'Загрузить и проверить'}
          </Button>
        </div>
        {error && <p className={catalogStyles.formError}>{error}</p>}
        {upload.isError && <p className={catalogStyles.formError}>{errorMessage(upload)}</p>}
      </form>

      <div className={catalogStyles.tableWrap}>
        <table className={catalogStyles.table}>
          <thead>
            <tr>
              <th>Версия</th>
              <th>Загружена</th>
              <th>Автор</th>
              <th>Комментарий</th>
              <th>Валидность</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan="7" className={catalogStyles.hint}>
                  Загрузка…
                </td>
              </tr>
            )}
            {versionsQuery.isError && (
              <tr>
                <td colSpan="7">
                  <div className={catalogStyles.errorRow}>
                    <span>{parseApiError(versionsQuery.error).message}</span>
                    <Button variant="secondary" onClick={() => versionsQuery.refetch()}>
                      Повторить
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {versions?.length === 0 && !isLoading && !versionsQuery.isError && (
              <tr>
                <td colSpan="7" className={catalogStyles.hint}>
                  Версий ещё нет
                </td>
              </tr>
            )}
            {versions?.map((version) => {
              const isActive =
                version.activatedAt &&
                versions.every(
                  (other) =>
                    !other.activatedAt ||
                    other.id === version.id ||
                    new Date(other.activatedAt) <= new Date(version.activatedAt),
                );
              const valid = version.validationResult?.valid;
              return (
                <tr key={version.id}>
                  <td>v{version.versionNumber}</td>
                  <td>{formatDateTime(version.createdAt)}</td>
                  <td>{version.uploadedByUser?.fullName ?? '—'}</td>
                  <td>{version.comment || '—'}</td>
                  <td>
                    {valid ? (
                      <span className={catalogStyles.active}>Валидна</span>
                    ) : (
                      <div className={styles.invalidBlock}>
                        <span className={styles.invalid}>
                          Ошибки ({(version.validationResult?.errors ?? []).length})
                        </span>
                        <ul className={styles.validationErrors}>
                          {(version.validationResult?.errors ?? []).map((validationError) => (
                            <li key={validationError}>{validationError}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </td>
                  <td>
                    {isActive ? (
                      <span className={catalogStyles.active}>Активна</span>
                    ) : (
                      <span className={catalogStyles.archived}>—</span>
                    )}
                  </td>
                  <td className={catalogStyles.actions}>
                    <button
                      type="button"
                      className={catalogStyles.linkButton}
                      disabled={Boolean(pending)}
                      onClick={() => setEditorVersion(version)}
                    >
                      Редактор
                    </button>
                    <button
                      type="button"
                      className={catalogStyles.linkButton}
                      disabled={Boolean(pending)}
                      onClick={() =>
                        runAction(`download:${version.id}`, () =>
                          printFormTemplatesApi.download(version.id, version.originalFileName),
                        )
                      }
                    >
                      Скачать
                    </button>
                    <button
                      type="button"
                      className={catalogStyles.linkButton}
                      disabled={Boolean(pending) || !dpoId}
                      title={!dpoId ? 'Выберите ДПО и период выше' : undefined}
                      onClick={() =>
                        runAction(`preview-xlsx:${version.id}`, () =>
                          printFormTemplatesApi.preview(version.id, {
                            format: 'xlsx',
                            dpoId,
                            from: range.from,
                            to: range.to,
                          }),
                        )
                      }
                    >
                      Превью Excel
                    </button>
                    <button
                      type="button"
                      className={catalogStyles.linkButton}
                      disabled={Boolean(pending) || !dpoId}
                      title={!dpoId ? 'Выберите ДПО и период выше' : undefined}
                      onClick={() =>
                        runAction(`preview-pdf:${version.id}`, () =>
                          printFormTemplatesApi.preview(version.id, {
                            format: 'pdf',
                            dpoId,
                            from: range.from,
                            to: range.to,
                          }),
                        )
                      }
                    >
                      Превью PDF
                    </button>
                    {!isActive && (
                      <button
                        type="button"
                        className={catalogStyles.linkButton}
                        disabled={Boolean(pending) || !valid || activate.isPending}
                        title={
                          !valid ? 'Нельзя активировать версию с ошибками валидации' : undefined
                        }
                        onClick={() => activate.mutate(version.id)}
                      >
                        Активировать
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
