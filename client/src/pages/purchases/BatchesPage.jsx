import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useBatches } from '../../features/purchases/batches/model/use-batches-queries.js';
import { Button } from '../../shared/ui/Button.jsx';
import { QueryState } from '../../shared/ui/QueryState.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';

export function BatchesPage() {
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

  const query = useBatches({
    search: debouncedSearch || undefined,
    page,
    limit: 50,
    sort: 'receivedDate',
    order: 'DESC',
  });

  function goToPage(nextPage) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

  if (query.isError) return <QueryState query={query} />;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Партии</h1>
          <p className={styles.subtitle}>
            Партии создаются проведёнными поступлениями; здесь доступен только просмотр.
          </p>
        </div>
      </div>

      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Код партии, поставщик или примечание…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            goToPage(1);
          }}
        />
      </div>

      <div className={styles.summaryBar}>
        <span className={styles.summaryItem}>
          Найдено партий: <strong>{query.meta?.total ?? 0}</strong>
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Партия</th>
              <th>Поставщик</th>
              <th>Поступление</th>
              <th>Принято</th>
              <th>На складе</th>
              <th>Выдано</th>
              <th>Стирка/ремонт</th>
              <th>Списано</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td className={styles.hint} colSpan={9}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!query.isLoading && query.data?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={9}>
                  Партии не найдены
                </td>
              </tr>
            )}
            {query.data?.map((batch) => (
              <tr key={batch.id}>
                <td>{batch.receivedDate ?? '—'}</td>
                <td>
                  <Link className={styles.linkButton} to={`/purchases/batches/${batch.id}`}>
                    {batch.code}
                  </Link>
                </td>
                <td>{batch.supplier?.name ?? '—'}</td>
                <td>{batch.receivingDocument?.number ?? '—'}</td>
                <td>{batch.initialQuantity}</td>
                <td>{batch.inStock}</td>
                <td>{batch.issued}</td>
                <td>{batch.inService}</td>
                <td>{batch.writtenOff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(query.meta?.pages ?? 0) > 1 && (
        <nav className={styles.pagination} aria-label="Навигация по страницам партий">
          <Button
            variant="secondary"
            disabled={page <= 1 || query.isLoading}
            onClick={() => goToPage(page - 1)}
          >
            Назад
          </Button>
          <span>
            Страница {query.meta.page} из {query.meta.pages} · записей: {query.meta.total}
          </span>
          <Button
            variant="secondary"
            disabled={page >= query.meta.pages || query.isLoading}
            onClick={() => goToPage(page + 1)}
          >
            Далее
          </Button>
        </nav>
      )}
    </div>
  );
}
