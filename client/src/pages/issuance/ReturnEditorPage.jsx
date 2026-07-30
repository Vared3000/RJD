import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useReturnDocument,
  useReturnMutations,
  useAvailableInstances,
} from '../../features/issuance/returns/model/use-return-queries.js';
import { headerFields, headerSchema } from '../../features/issuance/returns/model/header-schema.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Select } from '../../shared/ui/Select.jsx';
import { TextField } from '../../shared/ui/TextField.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from '../purchases/ReceivingEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const CONDITION_LABELS = { new: 'Новое', good: 'Хорошее', worn: 'Изношено', damaged: 'Повреждено' };
const ROUTE_TO_LABELS = { in_stock: 'На склад', laundry: 'В стирку', repair: 'В ремонт' };

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось сохранить';
}

// Строка возврата — не универсальная форма-конструктор (EntityFormModal):
// выбор ограничен экземплярами, реально выданными работнику из шапки
// документа (GET /issuance/returns/available), поэтому список опций
// зависит от документа, а не от статичного справочника.
function AddLineModal({ employeeId, existingInstanceIds, onSubmit, onClose, isSaving, error }) {
  const { data: instances, isLoading } = useAvailableInstances(employeeId);
  const [instanceId, setInstanceId] = useState('');
  const [condition, setCondition] = useState('good');
  const [routeTo, setRouteTo] = useState('in_stock');
  const [note, setNote] = useState('');

  const options = (instances ?? [])
    .filter((instance) => !existingInstanceIds.includes(instance.id))
    .map((instance) => ({
      value: instance.id,
      label: `${instance.inventoryNumber} — ${instance.model?.name ?? ''}`,
    }));

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({ instanceId, condition, routeTo, note });
  }

  return (
    <Modal title="Добавить позицию возврата" onClose={onClose}>
      <form className={catalogStyles.form} onSubmit={handleSubmit}>
        {isLoading && <p className={catalogStyles.hint}>Загрузка выданных экземпляров…</p>}
        {!isLoading && options.length === 0 && (
          <p className={catalogStyles.hint}>У работника нет выданных экземпляров для возврата.</p>
        )}
        <Select
          id="instanceId"
          label="Экземпляр"
          value={instanceId}
          onChange={(event) => setInstanceId(event.target.value)}
          options={options}
        />
        <Select
          id="condition"
          label="Состояние при возврате"
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          options={Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Select
          id="routeTo"
          label="Куда направить"
          value={routeTo}
          onChange={(event) => setRouteTo(event.target.value)}
          options={Object.entries(ROUTE_TO_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <TextField
          id="note"
          label="Примечание"
          value={note}
          onChange={(event) => setNote(event.target.value)}
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

export function ReturnEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: document, isLoading } = useReturnDocument(id);
  const { update, remove, addLine, removeLine, post } = useReturnMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('issuance.manage'),
  );

  if (isLoading || !document) {
    return <p className={catalogStyles.hint}>Загрузка…</p>;
  }

  const isDraft = document.status === 'draft';
  const lines = document.lines ?? [];

  async function handleHeaderSubmit(values) {
    await update.mutateAsync(values);
    setEditingHeader(false);
  }

  async function handleAddLine(values) {
    await addLine.mutateAsync(values);
    setAddingLine(false);
  }

  async function handlePost() {
    await post.mutateAsync();
    setConfirmingPost(false);
  }

  async function handleDeleteDocument() {
    await remove.mutateAsync();
    navigate('/issuance/returns');
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Возврат {document.number}</h1>
          <p className={styles.subtitle}>
            {STATUS_LABELS[document.status] ?? document.status}
            {document.status === 'posted' &&
              document.postedByUser &&
              ` · ${document.postedByUser.fullName}`}
          </p>
        </div>
        {isDraft && canManage && (
          <div className={styles.headerActions}>
            <Button variant="secondary" onClick={() => setEditingHeader(true)}>
              Изменить шапку
            </Button>
            <Button variant="danger" onClick={handleDeleteDocument} disabled={remove.isPending}>
              Удалить черновик
            </Button>
            <Button onClick={() => setConfirmingPost(true)} disabled={lines.length === 0}>
              Провести
            </Button>
          </div>
        )}
      </div>

      <div className={styles.summary}>
        <div>
          <span className={styles.label}>Работник</span>
          <span>{document.employee?.fullName ?? '—'}</span>
        </div>
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
              <th>Состояние</th>
              <th>Куда направлено</th>
              <th>Примечание</th>
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
                <td>
                  {line.instance?.size
                    ? `${line.instance.size.value}${line.instance.heightSize ? `/${line.instance.heightSize.value}` : ''}`
                    : '—'}
                </td>
                <td>{CONDITION_LABELS[line.condition] ?? line.condition}</td>
                <td>{ROUTE_TO_LABELS[line.routeTo] ?? line.routeTo}</td>
                <td>{line.note ?? '—'}</td>
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
          employeeId={document.employeeId}
          existingInstanceIds={lines.map((line) => line.instanceId)}
          onSubmit={handleAddLine}
          onClose={() => setAddingLine(false)}
          isSaving={addLine.isPending}
          error={errorMessage(addLine)}
        />
      )}

      {confirmingPost && (
        <Modal title="Провести документ?" onClose={() => setConfirmingPost(false)}>
          <p className={styles.confirmText}>
            После проведения экземпляры вернутся на склад в статус «На складе», документ станет
            недоступен для изменения. Действие необратимо.
          </p>
          {post.isError && <p className={catalogStyles.formError}>{errorMessage(post)}</p>}
          <div className={catalogStyles.formActions}>
            <Button variant="secondary" onClick={() => setConfirmingPost(false)}>
              Отмена
            </Button>
            <Button onClick={handlePost} disabled={post.isPending}>
              {post.isPending ? 'Проведение…' : 'Провести'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
