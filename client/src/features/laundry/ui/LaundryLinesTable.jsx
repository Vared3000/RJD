import { CONDITION_LABELS } from '../../service-documents/model/labels.js';
import catalogStyles from '../../catalogs/ui/CatalogPage.module.css';

export function LaundryLinesTable({ lines, isDraft, canManage, onRemoveLine }) {
  return (
    <div className={catalogStyles.tableWrap}>
      <table className={catalogStyles.table}>
        <thead>
          <tr>
            <th>Экземпляр</th>
            <th>Модель</th>
            <th>Размер</th>
            <th>Состояние до</th>
            <th>Состояние после</th>
            {isDraft && canManage && <th aria-label="Действия" />}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td className={catalogStyles.hint} colSpan={6}>
                Позиций пока нет
              </td>
            </tr>
          )}
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.instance?.inventoryNumber}</td>
              <td>{line.instance?.model?.name ?? '—'}</td>
              <td>
                {line.instance?.size
                  ? `${line.instance.size.value}${line.instance.heightSize ? `/${line.instance.heightSize.value}` : ''}`
                  : '—'}
              </td>
              <td>{CONDITION_LABELS[line.conditionBefore] ?? line.conditionBefore ?? '—'}</td>
              <td>{CONDITION_LABELS[line.conditionAfter] ?? line.conditionAfter ?? '—'}</td>
              {isDraft && canManage && (
                <td className={catalogStyles.actions}>
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
