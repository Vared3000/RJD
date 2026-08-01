import catalogStyles from '../../catalogs/ui/CatalogPage.module.css';
import styles from './EmployeePropertyTable.module.css';

function formatMoney(value) {
  return value == null ? '—' : `${Number(value).toFixed(2)} ₽`;
}

export function EmployeePropertyTable({ instances, totals, isLoading }) {
  return (
    <div className={catalogStyles.tableWrap}>
      <table className={catalogStyles.table}>
        <thead>
          <tr>
            <th>Инв. номер</th>
            <th>Модель</th>
            <th>Размер</th>
            <th>Рост</th>
            <th>Стоимость</th>
            <th>Для работника</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td className={catalogStyles.hint} colSpan={6}>
                Загрузка…
              </td>
            </tr>
          )}
          {!isLoading && instances.length === 0 && (
            <tr>
              <td className={catalogStyles.hint} colSpan={6}>
                Сейчас на руках у работника ничего нет
              </td>
            </tr>
          )}
          {instances.map((instance) => (
            <tr key={instance.id}>
              <td>{instance.inventoryNumber}</td>
              <td>{instance.model?.name ?? '—'}</td>
              <td>{instance.size?.value ?? '—'}</td>
              <td>{instance.heightSize?.value ?? '—'}</td>
              <td>{formatMoney(instance.cost)}</td>
              <td>{formatMoney(instance.employeeCost)}</td>
            </tr>
          ))}
        </tbody>
        {instances.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={4} className={styles.totalLabel}>
                Итого
              </td>
              <td>{formatMoney(totals?.totalCost)}</td>
              <td>{formatMoney(totals?.totalEmployeeCost)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
