import catalogStyles from '../../../catalogs/ui/CatalogPage.module.css';

const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

function defaultDisplay(line) {
  return {
    modelName: line.model?.name,
    sizeLabel: line.size
      ? `${SIZE_TYPE_LABELS[line.size.type] ?? line.size.type}: ${line.size.value}`
      : '—',
    heightLabel: line.heightSize?.value ?? '—',
  };
}

// resolveDisplay — переопределяется задачей 22 в режиме редакции проведённого
// документа: draftLines хранят только id модели/размера (без populated
// подобъектов с сервера), нужен резолв по id из кэшированных справочников.
export function IssuanceLinesTable({
  lines,
  editable,
  resolveDisplay = defaultDisplay,
  onEditLine,
  onRemoveLine,
  isRemoving,
  showAvailability = false,
}) {
  const quantityColumnCount = showAvailability ? 4 : 1;
  const totalColumnCount = 3 + quantityColumnCount + (editable ? 1 : 0);
  return (
    <div className={catalogStyles.tableWrap}>
      <table className={catalogStyles.table}>
        <thead>
          <tr>
            <th>Модель</th>
            <th>Размер</th>
            <th>Рост</th>
            {showAvailability ? (
              <>
                <th>Требуется</th>
                <th>Есть на складе</th>
                <th>В сборку</th>
                <th>Не хватает</th>
              </>
            ) : (
              <th>Кол-во</th>
            )}
            {editable && <th aria-label="Действия" />}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td className={catalogStyles.hint} colSpan={totalColumnCount}>
                Позиций пока нет
              </td>
            </tr>
          )}
          {lines.map((line, index) => {
            const display = resolveDisplay(line);
            return (
              <tr key={line.id ?? index}>
                <td>{display.modelName}</td>
                <td>{display.sizeLabel}</td>
                <td>{display.heightLabel}</td>
                {showAvailability ? (
                  <>
                    <td>{line.requiredQuantity ?? line.quantity}</td>
                    <td>{line.availableQuantity ?? 0}</td>
                    <td>{line.assemblyQuantity ?? 0}</td>
                    <td>{line.missingQuantity ?? 0}</td>
                  </>
                ) : (
                  <td>{line.quantity}</td>
                )}
                {editable && (
                  <td className={catalogStyles.actions}>
                    <button
                      type="button"
                      className={catalogStyles.linkButton}
                      onClick={() => onEditLine(line, index)}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      className={catalogStyles.linkButton}
                      disabled={isRemoving}
                      onClick={() => onRemoveLine(line, index)}
                    >
                      Удалить
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
