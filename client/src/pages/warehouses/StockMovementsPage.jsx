import { useState } from 'react';
import { useStockMovements } from '../../features/warehouses/stock/model/use-stock-queries.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Select } from '../../shared/ui/Select.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './StockPage.module.css';

const DOCUMENT_TYPE_LABELS = {
  receiving: 'Поступление',
  issuance: 'Выдача',
  return: 'Возврат',
};

function formatDateTime(value) {
  return new Date(value).toLocaleString('ru-RU');
}

export function StockMovementsPage() {
  const [warehouseId, setWarehouseId] = useState('');

  const { data: warehouses } = createCatalogHooks('warehouses').useList(false);
  const { data: movements, isLoading } = useStockMovements({
    warehouseId: warehouseId || undefined,
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Движения склада</h1>
      </div>

      <div className={pageStyles.filters}>
        <Select
          label="Склад"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
          options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Экземпляр</th>
              <th>Модель</th>
              <th>Откуда</th>
              <th>Куда</th>
              <th>Документ</th>
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
            {!isLoading && movements?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={6}>
                  Движений пока нет
                </td>
              </tr>
            )}
            {movements?.map((movement) => (
              <tr key={movement.id}>
                <td>{formatDateTime(movement.occurredAt)}</td>
                <td>{movement.instance?.inventoryNumber ?? '—'}</td>
                <td>{movement.instance?.model?.name ?? '—'}</td>
                <td>{movement.fromWarehouse?.name ?? '—'}</td>
                <td>{movement.toWarehouse?.name ?? '—'}</td>
                <td>{DOCUMENT_TYPE_LABELS[movement.documentType] ?? movement.documentType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
