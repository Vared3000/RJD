import styles from '../../catalogs/ui/CatalogPage.module.css';

// columns — [{ key, label, render?(row) }].
// totals — объект итогов; totalColumns — [{ key, label, render?(totals) }]
// (обычно первая колонка totalColumns — просто подпись "Итого", остальные
// повторяют числовые колонки columns).
export function ReportTable({ columns, rows, isLoading, totalColumns, totals }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td className={styles.hint} colSpan={columns.length}>
                Загрузка…
              </td>
            </tr>
          )}
          {!isLoading && rows?.length === 0 && (
            <tr>
              <td className={styles.hint} colSpan={columns.length}>
                Ничего не найдено
              </td>
            </tr>
          )}
          {rows?.map((row, index) => (
            <tr key={row.id ?? index}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && totalColumns && rows?.length > 0 && (
          <tfoot>
            <tr>
              {totalColumns.map((column) => (
                <td key={column.key}>
                  <strong>
                    {column.render ? column.render(totals) : (totals[column.key] ?? '—')}
                  </strong>
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
