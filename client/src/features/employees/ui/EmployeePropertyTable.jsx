import catalogStyles from '../../catalogs/ui/CatalogPage.module.css';

export function EmployeePropertyTable({ instances, isLoading }) {
  return (
    <div className={catalogStyles.tableWrap}>
      <table className={catalogStyles.table}>
        <thead>
          <tr>
            <th>Инв. номер</th>
            <th>Модель</th>
            <th>Размер</th>
            <th>Рост</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td className={catalogStyles.hint} colSpan={4}>
                Загрузка…
              </td>
            </tr>
          )}
          {!isLoading && instances.length === 0 && (
            <tr>
              <td className={catalogStyles.hint} colSpan={4}>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
