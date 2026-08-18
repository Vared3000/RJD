import { useState } from 'react';
import { useStockBalances } from '../../features/warehouses/stock/model/use-stock-queries.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import { ReportExportButtons } from '../../features/reports/ui/ReportExportButtons.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './StockPage.module.css';

const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

function formatSize(size) {
  if (!size) return '—';
  return `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`;
}

export function StockBalancesPage() {
  const [warehouseId, setWarehouseId] = useState('');
  const [modelId, setModelId] = useState('');
  const [sort, setSort] = useState('warehouse');
  const [order, setOrder] = useState('ASC');

  const { data: warehouses } = createCatalogHooks('warehouses').useList(false);
  const { data: models } = createCatalogHooks('nomenclature-models').useList(false);
  const { data: rows, isLoading } = useStockBalances({
    warehouseId: warehouseId || undefined,
    modelId: modelId || undefined,
    sort,
    order,
  });

  const totalQuantity = rows?.reduce((sum, row) => sum + row.quantity, 0) ?? 0;

  function changeSort(nextSort) {
    if (sort === nextSort) {
      setOrder((current) => (current === 'ASC' ? 'DESC' : 'ASC'));
      return;
    }
    setSort(nextSort);
    setOrder('ASC');
  }

  function sortLabel(label, key) {
    return `${label}${sort === key ? (order === 'ASC' ? ' ↑' : ' ↓') : ''}`;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Остатки по складам</h1>
      </div>

      <div className={pageStyles.filters}>
        <Select
          label="Склад"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
          options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
        <Select
          label="Модель"
          value={modelId}
          onChange={(event) => setModelId(event.target.value)}
          options={(models ?? []).map((m) => ({ value: m.id, label: m.name }))}
        />
      </div>

      <ReportExportButtons
        report="stock-balances"
        params={{
          warehouseId: warehouseId || undefined,
          modelId: modelId || undefined,
          sort,
          order,
        }}
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className={pageStyles.sortButton}
                  onClick={() => changeSort('warehouse')}
                >
                  {sortLabel('Склад', 'warehouse')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={pageStyles.sortButton}
                  onClick={() => changeSort('model')}
                >
                  {sortLabel('Модель', 'model')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={pageStyles.sortButton}
                  onClick={() => changeSort('size')}
                >
                  {sortLabel('Размер', 'size')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={pageStyles.sortButton}
                  onClick={() => changeSort('height')}
                >
                  {sortLabel('Рост', 'height')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={pageStyles.sortButton}
                  onClick={() => changeSort('quantity')}
                >
                  {sortLabel('Количество', 'quantity')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={5}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && rows?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={5}>
                  Остатков нет
                </td>
              </tr>
            )}
            {rows?.map((row, index) => (
              <tr key={index}>
                <td>{row.warehouse?.name ?? '—'}</td>
                <td>{row.model?.name ?? '—'}</td>
                <td>{formatSize(row.size)}</td>
                <td>{row.heightSize?.value ?? '—'}</td>
                <td>{row.quantity}</td>
              </tr>
            ))}
          </tbody>
          {rows?.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}>
                  <strong>Итого</strong>
                </td>
                <td>
                  <strong>{totalQuantity}</strong>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
