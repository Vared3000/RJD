import { useEffect, useState } from 'react';
import { useStockBalances } from '../../features/warehouses/stock/model/use-stock-queries.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import { SearchableSelect } from '../../shared/ui/SearchableSelect.jsx';
import { Button } from '../../shared/ui/Button.jsx';
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

const GENDER_CATEGORY_LABELS = {
  male: 'Мужское',
  female: 'Женское',
  unisex: 'Унисекс',
  unspecified: 'Не определено',
};

function formatSize(size) {
  if (!size) return '—';
  return `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`;
}

const EMPTY_FILTERS = {
  warehouseId: '',
  modelId: '',
  genderCategory: '',
  sizeId: '',
  heightSizeId: '',
};

const modelsHooks = createCatalogHooks('nomenclature-models');

export function StockBalancesPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('warehouse');
  const [order, setOrder] = useState('ASC');
  const [modelSearch, setModelSearch] = useState('');
  const [debouncedModelSearch, setDebouncedModelSearch] = useState('');

  const { data: warehouses } = createCatalogHooks('warehouses').useList(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedModelSearch(modelSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [modelSearch]);
  const { data: models, isFetching: modelsLoading } = modelsHooks.useList(false, {
    search: debouncedModelSearch,
    limit: 40,
  });
  const { data: selectedModel } = modelsHooks.useOne(filters.modelId, {
    enabled: Boolean(filters.modelId),
  });
  const { data: sizes } = createCatalogHooks('sizes').useList(false);
  const { data: rows, isLoading } = useStockBalances({
    warehouseId: filters.warehouseId || undefined,
    modelId: filters.modelId || undefined,
    genderCategory: filters.genderCategory || undefined,
    sizeId: filters.sizeId || undefined,
    heightSizeId: filters.heightSizeId || undefined,
    sort,
    order,
  });

  const heightSizes = (sizes ?? []).filter((s) => s.type === 'height');
  const modelOptions =
    selectedModel && !(models ?? []).some((model) => model.id === selectedModel.id)
      ? [selectedModel, ...(models ?? [])]
      : (models ?? []);
  const totalQuantity = rows?.reduce((sum, row) => sum + row.quantity, 0) ?? 0;

  function setFilter(name, value) {
    setFilters((prev) => ({ ...prev, [name]: value }));
  }

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
          placeholder="Все"
          value={filters.warehouseId}
          onChange={(event) => setFilter('warehouseId', event.target.value)}
          options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
        <Select
          label="Категория по полу"
          placeholder="Все"
          value={filters.genderCategory}
          onChange={(event) => setFilter('genderCategory', event.target.value)}
          options={Object.entries(GENDER_CATEGORY_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <SearchableSelect
          label="Модель"
          placeholder="Все — начните вводить название"
          value={filters.modelId}
          onChange={(value) => setFilter('modelId', value)}
          onSearch={setModelSearch}
          isLoading={modelsLoading}
          options={modelOptions.map((m) => ({ value: m.id, label: m.name }))}
        />
        <Select
          label="Размер"
          placeholder="Все"
          value={filters.sizeId}
          onChange={(event) => setFilter('sizeId', event.target.value)}
          options={(sizes ?? []).map((s) => ({ value: s.id, label: formatSize(s) }))}
        />
        <Select
          label="Рост"
          placeholder="Все"
          value={filters.heightSizeId}
          onChange={(event) => setFilter('heightSizeId', event.target.value)}
          options={heightSizes.map((s) => ({ value: s.id, label: s.value }))}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setFilters(EMPTY_FILTERS)}
          disabled={Object.values(filters).every((value) => !value)}
        >
          Сбросить фильтры
        </Button>
      </div>

      <div className={styles.summaryBar}>
        <span className={styles.summaryItem}>
          Найдено позиций: <strong>{rows?.length ?? 0}</strong>
        </span>
      </div>

      <ReportExportButtons
        report="stock-balances"
        params={{
          warehouseId: filters.warehouseId || undefined,
          modelId: filters.modelId || undefined,
          genderCategory: filters.genderCategory || undefined,
          sizeId: filters.sizeId || undefined,
          heightSizeId: filters.heightSizeId || undefined,
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
                  onClick={() => changeSort('genderCategory')}
                >
                  {sortLabel('Категория по полу', 'genderCategory')}
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
                <td className={styles.hint} colSpan={6}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && rows?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={6}>
                  Остатков нет
                </td>
              </tr>
            )}
            {rows?.map((row, index) => (
              <tr key={index}>
                <td>{row.warehouse?.name ?? '—'}</td>
                <td>{row.genderCategoryLabel ?? GENDER_CATEGORY_LABELS.unspecified}</td>
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
                <td colSpan={5}>
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
