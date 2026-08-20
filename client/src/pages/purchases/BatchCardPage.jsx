import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useBatch } from '../../features/purchases/batches/model/use-batches-queries.js';
import { Button } from '../../shared/ui/Button.jsx';
import { QueryState } from '../../shared/ui/QueryState.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './BatchCardPage.module.css';

const STATUS_LABELS = {
  in_stock: 'На складе',
  issued: 'Выдано',
  laundry: 'В стирке',
  repair: 'В ремонте',
  write_off: 'Списано',
};

export function BatchCardPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debouncedSearch) next.set('search', debouncedSearch);
        else next.delete('search');
        next.set('page', String(page));
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, page, setSearchParams]);

  const query = useBatch(id, {
    search: debouncedSearch || undefined,
    page,
    limit: 50,
    sort: 'inventoryNumber',
    order: 'ASC',
  });

  function goToPage(nextPage) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      if (debouncedSearch) next.set('search', debouncedSearch);
      else next.delete('search');
      return next;
    });
  }

  if (query.isLoading || query.isError || !query.data) return <QueryState query={query} />;
  const batch = query.data;
  const instanceMeta = query.meta?.instances;

  return (
    <div className={styles.page}>
      <Link to="/purchases/batches" className={styles.linkButton}>
        ← Все партии
      </Link>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Партия {batch.code}</h1>
          <p className={styles.subtitle}>
            {batch.supplier?.name ?? 'Поставщик не указан'} ·{' '}
            {batch.receivedDate ?? 'дата не указана'}
          </p>
        </div>
      </div>

      <dl className={pageStyles.summaryGrid}>
        <div>
          <dt>Поступление</dt>
          <dd>{batch.receivingDocument?.number ?? '—'}</dd>
        </div>
        <div>
          <dt>Склад при поступлении</dt>
          <dd>{batch.receivingDocument?.warehouse?.name ?? '—'}</dd>
        </div>
        <div>
          <dt>Первоначально</dt>
          <dd>{batch.initialQuantity}</dd>
        </div>
        <div>
          <dt>На складе</dt>
          <dd>{batch.inStock}</dd>
        </div>
        <div>
          <dt>Выдано</dt>
          <dd>{batch.issued}</dd>
        </div>
        <div>
          <dt>В стирке/ремонте</dt>
          <dd>{batch.inService}</dd>
        </div>
        <div>
          <dt>Списано</dt>
          <dd>{batch.writtenOff}</dd>
        </div>
      </dl>

      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Инвентарный номер, штрихкод или модель…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            goToPage(1);
          }}
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Инвентарный номер</th>
              <th>Модель</th>
              <th>Размер</th>
              <th>Рост</th>
              <th>Статус</th>
              <th>Склад / работник</th>
            </tr>
          </thead>
          <tbody>
            {batch.instances.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={6}>
                  Экземпляры не найдены
                </td>
              </tr>
            )}
            {batch.instances.map((instance) => (
              <tr key={instance.id}>
                <td>{instance.inventoryNumber}</td>
                <td>{instance.model?.name ?? '—'}</td>
                <td>{instance.size?.value ?? '—'}</td>
                <td>{instance.heightSize?.value ?? '—'}</td>
                <td>{STATUS_LABELS[instance.status] ?? instance.status}</td>
                <td>{instance.warehouse?.name ?? instance.employee?.fullName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(instanceMeta?.pages ?? 0) > 1 && (
        <nav className={styles.pagination} aria-label="Навигация по экземплярам партии">
          <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            Назад
          </Button>
          <span>
            Страница {instanceMeta.page} из {instanceMeta.pages} · экземпляров: {instanceMeta.total}
          </span>
          <Button
            variant="secondary"
            disabled={page >= instanceMeta.pages}
            onClick={() => goToPage(page + 1)}
          >
            Далее
          </Button>
        </nav>
      )}
    </div>
  );
}
