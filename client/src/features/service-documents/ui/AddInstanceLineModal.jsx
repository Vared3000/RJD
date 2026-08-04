import { useState } from 'react';
import { createCatalogHooks } from '../../catalogs/model/use-catalog-queries.js';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Select } from '../../../shared/ui/Select.jsx';
import catalogStyles from '../../catalogs/ui/CatalogPage.module.css';

const { useList: useInstancesList } = createCatalogHooks('instances');

// Строка — не EntityFormModal: список ограничен экземплярами, реально
// в наличии (in_stock) на складе документа, поэтому опции зависят от
// документа, а не от статичного справочника. Общий для Ремонта и Стирки —
// раньше дублировался по файлам один в один.
export function AddInstanceLineModal({
  warehouseId,
  existingInstanceIds,
  onSubmit,
  onClose,
  isSaving,
  error,
}) {
  const { data: instances, isLoading } = useInstancesList();
  const [instanceId, setInstanceId] = useState('');

  const options = (instances ?? [])
    .filter(
      (instance) =>
        instance.status === 'in_stock' &&
        instance.warehouseId === warehouseId &&
        !existingInstanceIds.includes(instance.id),
    )
    .map((instance) => ({
      value: instance.id,
      label: `${instance.inventoryNumber} — ${instance.model?.name ?? ''}`,
    }));

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({ instanceId });
  }

  return (
    <Modal title="Добавить позицию" onClose={onClose} closeOnOverlayClick={false}>
      <form className={catalogStyles.form} onSubmit={handleSubmit}>
        {isLoading && <p className={catalogStyles.hint}>Загрузка экземпляров…</p>}
        {!isLoading && options.length === 0 && (
          <p className={catalogStyles.hint}>На складе документа нет доступных экземпляров.</p>
        )}
        <Select
          id="instanceId"
          label="Экземпляр"
          value={instanceId}
          onChange={(event) => setInstanceId(event.target.value)}
          options={options}
        />
        {error && <p className={catalogStyles.formError}>{error}</p>}
        <div className={catalogStyles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={isSaving || !instanceId}>
            {isSaving ? 'Сохранение…' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
