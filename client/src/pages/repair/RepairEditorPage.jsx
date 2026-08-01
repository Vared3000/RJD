import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useRepairDocument,
  useRepairMutations,
} from '../../features/repair/model/use-repair-queries.js';
import { headerFields, headerSchema } from '../../features/repair/model/header-schema.js';
import { RepairLinesTable } from '../../features/repair/ui/RepairLinesTable.jsx';
import { RepairCompleteModal } from '../../features/repair/ui/RepairCompleteModal.jsx';
import { AddInstanceLineModal } from '../../features/service-documents/ui/AddInstanceLineModal.jsx';
import { SERVICE_DOCUMENT_STATUS_LABELS } from '../../features/service-documents/model/labels.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from '../purchases/ReceivingEditorPage.module.css';

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось сохранить';
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
          <p className={styles.subtitle}>
            {SERVICE_DOCUMENT_STATUS_LABELS[document.status] ?? document.status}
          </p>
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

      <RepairLinesTable
        lines={lines}
        isDraft={isDraft}
        canManage={canManage}
        onRemoveLine={(lineId) => removeLine.mutate(lineId)}
      />

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
        <AddInstanceLineModal
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
        <RepairCompleteModal
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
