import catalogStyles from '../../../catalogs/ui/CatalogPage.module.css';

const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

export function IssuanceLinesTable({ lines, isDraft, canManage, onEditLine, onRemoveLine }) {
  return (
    <div className={catalogStyles.tableWrap}>
      <table className={catalogStyles.table}>
        <thead>
          <tr>
            <th>Модель</th>
            <th>Размер</th>
            <th>Рост</th>
            <th>Кол-во</th>
            {isDraft && canManage && <th aria-label="Действия" />}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td className={catalogStyles.hint} colSpan={5}>
                Позиций пока нет
              </td>
            </tr>
          )}
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.model?.name}</td>
              <td>
                {line.size
                  ? `${SIZE_TYPE_LABELS[line.size.type] ?? line.size.type}: ${line.size.value}`
                  : '—'}
              </td>
              <td>{line.heightSize?.value ?? '—'}</td>
              <td>{line.quantity}</td>
              {isDraft && canManage && (
                <td className={catalogStyles.actions}>
                  <button
                    type="button"
                    className={catalogStyles.linkButton}
                    onClick={() => onEditLine(line)}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className={catalogStyles.linkButton}
                    onClick={() => onRemoveLine(line.id)}
                  >
                    Удалить
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
