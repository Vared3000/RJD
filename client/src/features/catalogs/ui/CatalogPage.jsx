import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createCatalogHooks } from '../model/use-catalog-queries.js';
import { EntityFormModal } from './EntityFormModal.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { useSessionStore } from '../../../shared/session/session-store.js';
import { parseApiError } from '../../../shared/lib/parse-api-error.js';
import { ReportExportButtons } from '../../reports/ui/ReportExportButtons.jsx';
import styles from './CatalogPage.module.css';

// resource — сегмент REST-пути ('organizations', 'subdivisions', ...).
// columns — [{ key, label, render?(item) }] для таблицы.
// fields — конфигурация полей формы, см. CatalogFormField.jsx.
// schema — общая zod-схема формы (используется и для создания, и для правки).
// filters — необязательный список select-фильтров сверх поиска/архива:
//   [{ name, label, options: [{ value, label }] }]. name должен совпадать с
//   именем query-параметра, который бэкенд принимает в filterFields
//   (см. reference-crud.factory.js).
// exportReport — id отчёта в report-export.service.js REPORTS для кнопок
//   "Скачать Excel/PDF" текущего (отфильтрованного) списка; необязателен.
export function CatalogPage({
  resource,
  title,
  columns,
  fields,
  schema,
  viewPermission = 'catalogs.view',
  managePermission = 'catalogs.manage',
  archiveColumnLabel = 'Статус',
  searchable = false,
  filters = [],
  exportReport,
  description,
}) {
  const { useList, useCatalogMutations } = createCatalogHooks(resource);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(searchParams.get('archived') === 'true');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [filterValues, setFilterValues] = useState(() =>
    Object.fromEntries(filters.map((filter) => [filter.name, searchParams.get(filter.name) ?? ''])),
  );
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const activeFilters = Object.fromEntries(
    Object.entries(filterValues).filter(([, value]) => value),
  );
  const {
    data: items,
    meta,
    isLoading,
    isError,
    error: listError,
    refetch,
  } = useList(showArchived, {
    ...(searchable ? { search: debouncedSearch } : {}),
    ...activeFilters,
    page,
    limit: 50,
  });
  const { create, update, archive, restore } = useCatalogMutations();
  const [editingItem, setEditingItem] = useState(null);
  const permissions = useSessionStore((state) => state.user?.permissions ?? []);
  const canView = permissions.includes(viewPermission);
  const canManage = permissions.includes(managePermission);

  const saveError = create.error ?? update.error;
  const isSaving = create.isPending || update.isPending;

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debouncedSearch) next.set('search', debouncedSearch);
        else next.delete('search');
        if (showArchived) next.set('archived', 'true');
        else next.delete('archived');
        for (const [name, value] of Object.entries(filterValues)) {
          if (value) next.set(name, value);
          else next.delete(name);
        }
        next.set('page', String(page));
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, filterValues, page, setSearchParams, showArchived]);

  function goToPage(nextPage) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

  function setFilter(name, value) {
    setFilterValues((current) => ({ ...current, [name]: value }));
    goToPage(1);
  }

  function closeModal() {
    setEditingItem(null);
    create.reset();
    update.reset();
  }

  async function handleSubmit(values) {
    if (editingItem?.id) {
      await update.mutateAsync({ id: editingItem.id, payload: values });
    } else {
      await create.mutateAsync(values);
    }
    closeModal();
  }

  if (!canView) {
    return <p className={styles.hint}>Недостаточно прав для просмотра этого раздела.</p>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>
            {description ?? 'Просматривайте записи, добавляйте новые и изменяйте существующие.'}
          </p>
        </div>
        {canManage && <Button onClick={() => setEditingItem({})}>+ Добавить</Button>}
      </div>

      <div className={styles.filterBar}>
        <label className={styles.archiveToggle}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => {
              setShowArchived(event.target.checked);
              goToPage(1);
            }}
          />
          Показать архивные
        </label>
        {searchable && (
          <input
            type="search"
            placeholder={`Найти в разделе «${title}»…`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              goToPage(1);
            }}
            className={styles.searchInput}
          />
        )}
        {filters.map((filter) => (
          <select
            key={filter.name}
            aria-label={filter.label}
            value={filterValues[filter.name] ?? ''}
            onChange={(event) => setFilter(filter.name, event.target.value)}
          >
            <option value="">{filter.label}: все</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      {exportReport && (
        <ReportExportButtons
          report={exportReport}
          params={{
            ...(searchable ? { search: debouncedSearch } : {}),
            ...activeFilters,
            includeArchived: showArchived || undefined,
          }}
        />
      )}

      <div className={styles.summaryBar} aria-label="Сводка списка">
        <span className={styles.summaryItem}>
          Найдено: <strong>{meta?.total ?? items?.length ?? 0}</strong>
        </span>
        {showArchived && <span className={styles.summaryItem}>Показан архив</span>}
        {debouncedSearch && (
          <span className={styles.summaryItem}>
            Поиск: <strong>{debouncedSearch}</strong>
          </span>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>{archiveColumnLabel}</th>
              {canManage && <th aria-label="Действия" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={columns.length + 2}>
                  Загрузка…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={columns.length + 2}>
                  <div className={styles.errorRow}>
                    <span>{parseApiError(listError).message}</span>
                    <Button variant="secondary" onClick={() => refetch()}>
                      Повторить
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !isError && items?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={columns.length + 2}>
                  Ничего не найдено
                </td>
              </tr>
            )}
            {items?.map((item) => (
              <tr key={item.id}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render ? column.render(item) : (item[column.key] ?? '—')}
                  </td>
                ))}
                <td>
                  {item.archivedAt ? (
                    <span className={styles.archived}>В архиве</span>
                  ) : (
                    <span className={styles.active}>Активно</span>
                  )}
                </td>
                {canManage && (
                  <td className={styles.actions}>
                    {!item.archivedAt && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => setEditingItem(item)}
                      >
                        Изменить
                      </button>
                    )}
                    {!item.archivedAt && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={archive.isPending}
                        onClick={() => archive.mutate(item.id)}
                      >
                        В архив
                      </button>
                    )}
                    {item.archivedAt && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(item.id)}
                      >
                        Восстановить
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(meta?.pages ?? 0) > 1 && (
        <nav className={styles.pagination} aria-label="Навигация по страницам">
          <Button
            variant="secondary"
            disabled={page <= 1 || isLoading}
            onClick={() => goToPage(page - 1)}
          >
            Назад
          </Button>
          <span>
            Страница {meta.page} из {meta.pages} · записей: {meta.total}
          </span>
          <Button
            variant="secondary"
            disabled={page >= meta.pages || isLoading}
            onClick={() => goToPage(page + 1)}
          >
            Далее
          </Button>
        </nav>
      )}

      {editingItem !== null && (
        <EntityFormModal
          title={editingItem.id ? `Изменить: ${title}` : `Создать: ${title}`}
          fields={fields}
          schema={schema}
          defaultValues={editingItem}
          onSubmit={handleSubmit}
          onClose={closeModal}
          isSaving={isSaving}
          error={saveError ? parseApiError(saveError).message : null}
        />
      )}
    </div>
  );
}
