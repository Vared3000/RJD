import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useReceivingList,
  useReceivingMutations,
} from '../../features/purchases/receiving/model/use-receiving-queries.js';
import {
  headerFields,
  headerSchema,
} from '../../features/purchases/receiving/model/header-schema.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import { formatDate } from '../../shared/lib/format-date.js';
import { parseApiError } from '../../shared/lib/parse-api-error.js';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const supplierHooks = createCatalogHooks('suppliers');
const warehouseHooks = createCatalogHooks('warehouses');

export function ReceivingListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const status = searchParams.get('status') ?? 'all';
  const supplierId = searchParams.get('supplierId') ?? '';
  const warehouseId = searchParams.get('warehouseId') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const { data: suppliers } = supplierHooks.useList(false, { limit: 200 });
  const { data: warehouses } = warehouseHooks.useList(false, { limit: 200 });
  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
  } = useReceivingList({
    search: urlSearch || undefined,
    status: status === 'all' ? undefined : status,
    supplierId: supplierId || undefined,
    warehouseId: warehouseId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: 50,
  });
  const documents = result?.items ?? [];
  const meta = result?.meta;
  const { create } = useReceivingMutations();
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('purchases.manage'),
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      const value = search.trim();
      setSearchParams(
        (current) => {
          if ((current.get('search') ?? '') === value) return current;
          const next = new URLSearchParams(current);
          if (value) next.set('search', value);
          else next.delete('search');
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
    }, 350);
    return () => clearTimeout(timeout);
  }, [search, setSearchParams]);

  function setFilter(name, value, emptyValue = '') {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value && value !== emptyValue) next.set(name, value);
      else next.delete(name);
      next.set('page', '1');
      return next;
    });
  }

  function goToPage(nextPage) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

  function resetFilters() {
    setSearch('');
    setSearchParams(new URLSearchParams({ page: '1' }));
  }

  async function handleCreate(values) {
    const document = await create.mutateAsync(values);
    setIsCreating(false);
    navigate(`/purchases/receiving/${document.id}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Поступления на склад</h1>
          <p className={styles.subtitle}>
            Приём партий от поставщиков и создание экземпляров одежды.
          </p>
        </div>
        {canManage && <Button onClick={() => setIsCreating(true)}>+ Новое поступление</Button>}
      </div>

      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.searchInput}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Номер поступления, УПД/накладной, поставщик или склад…"
          aria-label="Поиск документов поступления"
        />
        <select
          aria-label="Поставщик"
          value={supplierId}
          onChange={(event) => setFilter('supplierId', event.target.value)}
        >
          <option value="">Все поставщики</option>
          {(suppliers ?? []).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Склад"
          value={warehouseId}
          onChange={(event) => setFilter('warehouseId', event.target.value)}
        >
          <option value="">Все склады</option>
          {(warehouses ?? []).map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Статус"
          value={status}
          onChange={(event) => setFilter('status', event.target.value, 'all')}
        >
          <option value="all">Все статусы</option>
          <option value="draft">Черновики</option>
          <option value="posted">Проведённые</option>
        </select>
        <label className={styles.filterField}>
          Дата с
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setFilter('dateFrom', event.target.value)}
          />
        </label>
        <label className={styles.filterField}>
          Дата по
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => setFilter('dateTo', event.target.value)}
          />
        </label>
        <Button type="button" variant="secondary" onClick={resetFilters}>
          Сбросить
        </Button>
      </div>

      <div className={styles.summaryBar}>
        <span className={styles.summaryItem}>
          Найдено: <strong>{meta?.total ?? documents.length}</strong>
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Номер</th>
              <th>УПД №</th>
              <th>Поставщик</th>
              <th>Склад</th>
              <th>Дата</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={6}>
                  Загрузка…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={6}>
                  <div className={styles.errorRow}>
                    <span>{parseApiError(error).message}</span>
                    <Button variant="secondary" onClick={() => refetch()}>
                      Повторить
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !isError && documents.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={6}>
                  По выбранным условиям ничего не найдено
                </td>
              </tr>
            )}
            {documents.map((document) => (
              <tr
                key={document.id}
                className={styles.linkRow}
                tabIndex={0}
                onClick={() => navigate(`/purchases/receiving/${document.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/purchases/receiving/${document.id}`);
                  }
                }}
              >
                <td>{document.number}</td>
                <td>{document.invoiceNumber ?? '—'}</td>
                <td>{document.supplier?.name ?? '—'}</td>
                <td>{document.warehouse?.name ?? '—'}</td>
                <td>{formatDate(document.documentDate)}</td>
                <td>
                  <span className={document.status === 'posted' ? styles.active : styles.archived}>
                    {STATUS_LABELS[document.status] ?? document.status}
                  </span>
                </td>
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

      {isCreating && (
        <EntityFormModal
          title="Создать документ поступления"
          fields={headerFields}
          schema={headerSchema}
          defaultValues={{}}
          onSubmit={handleCreate}
          onClose={() => setIsCreating(false)}
          isSaving={create.isPending}
          error={
            create.error
              ? create.error?.response?.data?.error?.message || 'Не удалось создать'
              : null
          }
        />
      )}
    </div>
  );
}
