import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useWriteoffDocument,
  useWriteoffMutations,
} from '../../features/writeoff/model/use-writeoff-queries.js';
import { headerFields, headerSchema } from '../../features/writeoff/model/header-schema.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Select } from '../../shared/ui/Select.jsx';
import { TextField } from '../../shared/ui/TextField.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from '../purchases/ReceivingEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };

const { useList: useInstancesList } = createCatalogHooks('instances');

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось сохранить';
}

function AddLineModal({ warehouseId, existingInstanceIds, onSubmit, onClose, isSaving, error }) {
  const { data: instances, isLoading } = useInstancesList();
  const [instanceId, setInstanceId] = useState('');
  const [reason, setReason] = useState('');

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
    onSubmit({ instanceId, reason });
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
        <TextField
          id="reason"
          label="Причина списания"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && <p className={catalogStyles.formError}>{error}</p>}
        <div className={catalogStyles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={isSaving || !instanceId || !reason}>
            {isSaving ? 'Сохранение…' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function WriteoffEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: document, isLoading } = useWriteoffDocument(id);
  const { update, remove, addLine, removeLine, post } = useWriteoffMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('writeoff.manage'),
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
    navigate('/writeoff/documents');
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Списание {document.number}</h1>
          <p className={styles.subtitle}>{STATUS_LABELS[document.status] ?? document.status}</p>
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
              <th>Причина</th>
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
                <td>{line.instance?.inventoryNumber}</td>
                <td>{line.instance?.model?.name ?? '—'}</td>
                <td>
                  {line.instance?.size
                    ? line.instance.size
                      ? `${line.instance.size.value}${line.instance.heightSize ? `/${line.instance.heightSize.value}` : ''}`
                      : 'Без размера'
                    : '—'}
                </td>
                <td>{line.reason}</td>
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

      {confirmingPost && (
        <Modal title="Провести документ?" onClose={() => setConfirmingPost(false)}>
          <p className={styles.confirmText}>
            Экземпляры будут окончательно списаны (статус «Списан»), документ станет недоступен для
            изменения. Действие необратимо.
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
