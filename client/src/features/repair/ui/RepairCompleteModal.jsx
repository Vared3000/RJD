import { useState } from 'react';
import { CONDITION_LABELS } from '../../service-documents/model/labels.js';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Select } from '../../../shared/ui/Select.jsx';
import { TextField } from '../../../shared/ui/TextField.jsx';
import catalogStyles from '../../catalogs/ui/CatalogPage.module.css';

export function RepairCompleteModal({ lines, onSubmit, onClose, isSaving, error }) {
  const [conditions, setConditions] = useState(
    Object.fromEntries(lines.map((line) => [line.id, 'good'])),
  );
  const [costs, setCosts] = useState(Object.fromEntries(lines.map((line) => [line.id, ''])));

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      lines: lines.map((line) => ({
        lineId: line.id,
        conditionAfter: conditions[line.id],
        cost: costs[line.id] === '' ? undefined : Number(costs[line.id]),
      })),
    });
  }

  return (
    <Modal title="Завершить документ" onClose={onClose} closeOnOverlayClick={false}>
      <form className={catalogStyles.form} onSubmit={handleSubmit}>
        <p className={catalogStyles.hint}>
          Укажите итоговое состояние и стоимость ремонта по каждому экземпляру — они вернутся в
          наличие на склад.
        </p>
        {lines.map((line) => (
          <div key={line.id} className={catalogStyles.form}>
            <Select
              id={`condition-${line.id}`}
              label={`${line.instance?.inventoryNumber ?? ''} — ${line.instance?.model?.name ?? ''}: состояние`}
              value={conditions[line.id]}
              onChange={(event) =>
                setConditions((prev) => ({ ...prev, [line.id]: event.target.value }))
              }
              options={Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <TextField
              id={`cost-${line.id}`}
              label="Стоимость ремонта"
              type="number"
              value={costs[line.id]}
              onChange={(event) => setCosts((prev) => ({ ...prev, [line.id]: event.target.value }))}
            />
          </div>
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
