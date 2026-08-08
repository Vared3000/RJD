import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useAdjustmentDocument,
  useAdjustmentMutations,
} from '../../features/adjustments/model/use-adjustment-queries.js';
import {
  headerFields,
  headerSchema,
  ADJUSTMENT_TYPE_LABELS,
  CONDITION_LABELS,
} from '../../features/adjustments/model/header-schema.js';
import { lineFields, lineSchema } from '../../features/adjustments/model/line-schema.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from '../purchases/ReceivingEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось сохранить';
}

function lineSubject(line) {
  if (line.adjustmentType === 'surplus') {
    return line.instance?.inventoryNumber ?? line.model?.name ?? '—';
  }
  return line.instance?.inventoryNumber ?? '—';
}

function lineDetails(line) {
  switch (line.adjustmentType) {
    case 'surplus':
      return `${line.model?.name ?? '—'} → ${line.toWarehouse?.name ?? '—'}`;
    case 'relocate':
      return `→ ${line.toWarehouse?.name ?? '—'}`;
    case 'condition':
      return CONDITION_LABELS[line.toCondition] ?? line.toCondition;
    default:
      return line.instance?.model?.name ?? '—';
  }
}

export function AdjustmentEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: document, isLoading } = useAdjustmentDocument(id);
  const { update, remove, addLine, updateLine, removeLine, post } = useAdjustmentMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('adjustments.manage'),
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

  async function handleLineSubmit(values) {
    if (editingLine?.id) {
      await updateLine.mutateAsync({ lineId: editingLine.id, payload: values });
    } else {
      await addLine.mutateAsync(values);
    }
    setEditingLine(null);
  }

  async function handlePost() {
    await post.mutateAsync();
    setConfirmingPost(false);
  }

  async function handleDeleteDocument() {
    await remove.mutateAsync();
    navigate('/adjustments/documents');
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Корректировка {document.number}</h1>
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
          <Button onClick={() => setEditingLine({})}>+ Добавить позицию</Button>
        )}
      </div>

      <div className={catalogStyles.tableWrap}>
        <table className={catalogStyles.table}>
          <thead>
            <tr>
              <th>Тип</th>
              <th>Экземпляр</th>
              <th>Детали</th>
              <th>Основание</th>
              <th>Инвентаризация</th>
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
                <td>{ADJUSTMENT_TYPE_LABELS[line.adjustmentType] ?? line.adjustmentType}</td>
                <td>{lineSubject(line)}</td>
                <td>{lineDetails(line)}</td>
                <td>{line.reason}</td>
                <td>{line.inventoryDocument?.number ?? '—'}</td>
                {isDraft && canManage && (
                  <td className={catalogStyles.actions}>
                    <button
                      type="button"
                      className={catalogStyles.linkButton}
                      onClick={() => setEditingLine(line)}
                    >
                      Изменить
                    </button>
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

      {editingLine !== null && (
        <EntityFormModal
          title={editingLine.id ? 'Изменить позицию' : 'Добавить позицию'}
          fields={lineFields}
          schema={lineSchema}
          defaultValues={editingLine}
          onSubmit={handleLineSubmit}
          onClose={() => setEditingLine(null)}
          isSaving={addLine.isPending || updateLine.isPending}
          error={errorMessage(addLine.isError ? addLine : updateLine)}
        />
      )}

      {confirmingPost && (
        <Modal title="Провести документ?" onClose={() => setConfirmingPost(false)}>
          <p className={styles.confirmText}>
            Излишки будут оприходованы, недостачи списаны, найденные на другом складе — перемещены,
            состояние — исправлено. Документ станет недоступен для изменения. Действие необратимо.
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
