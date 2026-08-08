import { Button } from '../../../../shared/ui/Button.jsx';
import catalogStyles from '../../../catalogs/ui/CatalogPage.module.css';
import styles from '../../../../pages/purchases/ReceivingEditorPage.module.css';

export function KitPreviewPanel({
  kitPreview,
  isDraft,
  canManage,
  existingLineKeys,
  lineKey,
  isAddingLine,
  onAddItem,
  onAddAllItems,
  onRemoveItem,
  onHide,
}) {
  return (
    <div className={styles.kitPreview}>
      <div className={catalogStyles.header}>
        <h2 className={styles.linesTitle}>
          Комплект должности ({kitPreview.season === 'summer' ? 'летний' : 'зимний'})
        </h2>
        <div className={styles.kitPreviewActions}>
          {!kitPreview.noPosition && kitPreview.items.length > 0 && isDraft && canManage && (
            <Button variant="secondary" onClick={onAddAllItems} disabled={isAddingLine}>
              Добавить всё
            </Button>
          )}
          <button type="button" className={catalogStyles.linkButton} onClick={onHide}>
            Скрыть
          </button>
        </div>
      </div>
      {kitPreview.noPosition && (
        <p className={catalogStyles.hint}>
          У работника не указана должность — комплект недоступен.
        </p>
      )}
      {!kitPreview.noPosition && kitPreview.items.length === 0 && (
        <p className={catalogStyles.hint}>
          Для этого сезона комплект должности не настроен. Назначьте позициям сезон в разделе
          «Работники → Комплекты».
        </p>
      )}
      {!kitPreview.noPosition && kitPreview.items.length > 0 && (
        <div className={catalogStyles.tableWrap}>
          <table className={catalogStyles.table}>
            <thead>
              <tr>
                <th>Модель</th>
                <th>Размер</th>
                <th>Рост</th>
                <th>Нужно</th>
                <th>В наличии</th>
                {isDraft && canManage && <th aria-label="Действия" />}
              </tr>
            </thead>
            <tbody>
              {kitPreview.items.map((item, index) => {
                const alreadyAdded = existingLineKeys.has(
                  lineKey(item.modelId, item.sizeId, item.heightSizeId),
                );
                return (
                  <tr key={`${item.modelId}-${index}`}>
                    <td>{item.modelName}</td>
                    <td>{item.sizeLabel ?? '—'}</td>
                    <td>{item.heightLabel ?? '—'}</td>
                    <td>{item.quantity}</td>
                    <td>
                      {item.missingSize ? (
                        <span className={styles.error}>нет размера у работника</span>
                      ) : (
                        <span className={item.availableQuantity > 0 ? '' : styles.error}>
                          {item.availableQuantity}
                        </span>
                      )}
                    </td>
                    {isDraft && canManage && (
                      <td className={catalogStyles.actions}>
                        {alreadyAdded ? (
                          <span className={catalogStyles.hint}>Добавлено</span>
                        ) : (
                          <button
                            type="button"
                            className={catalogStyles.linkButton}
                            disabled={item.missingSize || isAddingLine}
                            onClick={() => onAddItem(item)}
                          >
                            Добавить
                          </button>
                        )}
                        <button
                          type="button"
                          className={catalogStyles.linkButton}
                          onClick={() => onRemoveItem(index)}
                        >
                          Убрать
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
