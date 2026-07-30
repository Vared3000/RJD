import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useRepairDocument,
  useRepairMutations,
} from '../../features/repair/model/use-repair-queries.js';
import { headerFields, headerSchema } from '../../features/repair/model/header-schema.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Select } from '../../shared/ui/Select.jsx';
import { TextField } from '../../shared/ui/TextField.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from '../purchases/ReceivingEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', sent: 'Отправлен', completed: 'Завершён' };
const CONDITION_LABELS = { new: 'Новое', good: 'Хорошее', worn: 'Изношено', damaged: 'Повреждено' };

const { useList: useInstancesList } = createCatalogHooks('instances');

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось сохранить';
}

// См. AddLineModal в LaundryEditorPage.jsx — тот же приём: список ограничен
// экземплярами, реально в наличии на складе документа.
function AddLineModal({ warehouseId, existingInstanceIds, onSubmit, onClose, isSaving, error }) {
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
    <Modal title="Добавить позицию" onClose={onClose}>
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

function CompleteModal({ lines, onSubmit, onClose, isSaving, error }) {
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
    <Modal title="Завершить документ" onClose={onClose}>
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

export function RepairEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: document, isLoading } = useRepairDocument(id);
  const { update, remove, addLine, removeLine, send, complete } = useRepairMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [completing, setCompleting] = useState(false);
  const canManage = useSessionStore((state) => state.user?.permissions?.includes('repair.manage'));

  if (isLoading || !document) {
    return <p className={catalogStyles.hint}>Загрузка…</p>;
  }

  const isDraft = document.status === 'draft';
  const isSent = document.status === 'sent';
  const lines = document.lines ?? [];

  async function handleHeaderSubmit(values) {
    await update.mutateAsync(values);
    setEditingHeader(false);
  }

  async function handleAddLine(values) {
    await addLine.mutateAsync(values);
    setAddingLine(false);
  }

  async function handleSend() {
    await send.mutateAsync();
    setConfirmingSend(false);
  }

  async function handleComplete(values) {
    await complete.mutateAsync(values);
    setCompleting(false);
  }

  async function handleDeleteDocument() {
    await remove.mutateAsync();
    navigate('/repair/documents');
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Ремонт {document.number}</h1>
          <p className={styles.subtitle}>{STATUS_LABELS[document.status] ?? document.status}</p>
        </div>
        <div className={styles.headerActions}>
          {isDraft && canManage && (
            <>
              <Button variant="secondary" onClick={() => setEditingHeader(true)}>
                Изменить шапку
              </Button>
              <Button variant="danger" onClick={handleDeleteDocument} disabled={remove.isPending}>
                Удалить черновик
              </Button>
              <Button onClick={() => setConfirmingSend(true)} disabled={lines.length === 0}>
                Отправить
              </Button>
            </>
          )}
          {isSent && canManage && <Button onClick={() => setCompleting(true)}>Завершить</Button>}
        </div>
      </div>

      <div className={styles.summary}>
        <div>
          <span className={styles.label}>Склад</span>
          <span>{document.warehouse?.name ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Дата</span>
          <span>{document.documentDate}</span>
        </div>
        {document.responsibleUser && (
          <div>
            <span className={styles.label}>Ответственный</span>
            <span>{document.responsibleUser.fullName}</span>
          </div>
        )}
      </div>

      <div className={catalogStyles.header}>
        <h2 className={styles.linesTitle}>Позиции</h2>
        {isDraft && canManage && (
          <Button onClick={() => setAddingLine(true)}>+ Добавить позицию</Button>
        )}
      </div>

      <div className={catalogStyles.tableWrap}>
        <table className={catalogStyles.table}>
          <thead>
            <tr>
              <th>Экземпляр</th>
              <th>Модель</th>
              <th>Размер</th>
              <th>Состояние до</th>
              <th>Состояние после</th>
              <th>Стоимость ремонта</th>
              {isDraft && canManage && <th aria-label="Действия" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td className={catalogStyles.hint} colSpan={7}>
                  Позиций пока нет
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.instance?.inventoryNumber}</td>
                <td>{line.instance?.model?.name ?? '—'}</td>
                <td>{line.instance?.size?.value ?? '—'}</td>
                <td>{CONDITION_LABELS[line.conditionBefore] ?? line.conditionBefore ?? '—'}</td>
                <td>{CONDITION_LABELS[line.conditionAfter] ?? line.conditionAfter ?? '—'}</td>
                <td>{line.cost != null ? `${line.cost} ₽` : '—'}</td>
                {isDraft && canManage && (
                  <td className={catalogStyles.actions}>
                    <button
                      type="button"
                      className={catalogStyles.linkButton}
                      onClick={() => removeLine.mutate(line.id)}
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

      {editingHeader && (
        <EntityFormModal
          title="Изменить шапку документа"
          fields={headerFields}
          schema={headerSchema}
          defaultValues={document}
          onSubmit={handleHeaderSubmit}
          onClose={() => setEditingHeader(false)}
          isSaving={update.isPending}
          error={errorMessage(update)}
        />
      )}

      {addingLine && (
        <AddLineModal
          warehouseId={document.warehouseId}
          existingInstanceIds={lines.map((line) => line.instanceId)}
          onSubmit={handleAddLine}
          onClose={() => setAddingLine(false)}
          isSaving={addLine.isPending}
          error={errorMessage(addLine)}
        />
      )}

      {confirmingSend && (
        <Modal title="Отправить документ?" onClose={() => setConfirmingSend(false)}>
          <p className={styles.confirmText}>
            Экземпляры будут сняты с остатков склада и переведены в статус «В ремонте». Действие
            необратимо.
          </p>
          {send.isError && <p className={catalogStyles.formError}>{errorMessage(send)}</p>}
          <div className={catalogStyles.formActions}>
            <Button variant="secondary" onClick={() => setConfirmingSend(false)}>
              Отмена
            </Button>
            <Button onClick={handleSend} disabled={send.isPending}>
              {send.isPending ? 'Отправка…' : 'Отправить'}
            </Button>
          </div>
        </Modal>
      )}

      {completing && (
        <CompleteModal
          lines={lines}
          onSubmit={handleComplete}
          onClose={() => setCompleting(false)}
          isSaving={complete.isPending}
          error={errorMessage(complete)}
        />
      )}
    </div>
  );
}
