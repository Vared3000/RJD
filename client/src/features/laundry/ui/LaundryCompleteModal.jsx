import { useState } from 'react';
import { CONDITION_LABELS } from '../../service-documents/model/labels.js';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Select } from '../../../shared/ui/Select.jsx';
import catalogStyles from '../../catalogs/ui/CatalogPage.module.css';

export function LaundryCompleteModal({ lines, onSubmit, onClose, isSaving, error }) {
  const [conditions, setConditions] = useState(
    Object.fromEntries(lines.map((line) => [line.id, 'good'])),
  );

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      lines: lines.map((line) => ({ lineId: line.id, conditionAfter: conditions[line.id] })),
    });
  }

  return (
    <Modal title="Завершить документ" onClose={onClose}>
      <form className={catalogStyles.form} onSubmit={handleSubmit}>
        <p className={catalogStyles.hint}>
          Укажите итоговое состояние по каждому экземпляру — они вернутся в наличие на склад.
        </p>
        {lines.map((line) => (
          <Select
            key={line.id}
            id={`condition-${line.id}`}
            label={`${line.instance?.inventoryNumber ?? ''} — ${line.instance?.model?.name ?? ''}`}
            value={conditions[line.id]}
            onChange={(event) =>
              setConditions((prev) => ({ ...prev, [line.id]: event.target.value }))
            }
            options={Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }))}
          />
        ))}
        {error && <p className={catalogStyles.formError}>{error}</p>}
        <div className={catalogStyles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Завершение…' : 'Завершить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
