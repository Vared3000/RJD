import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useInventoryDocument,
  useInventoryMutations,
} from '../../features/inventory/model/use-inventory-queries.js';
import {
  updateHeaderFields,
  updateHeaderSchema,
} from '../../features/inventory/model/header-schema.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from '../purchases/ReceivingEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', completed: 'Завершена' };

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось сохранить';
}

export function InventoryEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: document, isLoading } = useInventoryDocument(id);
  const { update, remove, updateLine, removeLine, complete } = useInventoryMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('inventory.manage'),
  );

  if (isLoading || !document) {
    return <p className={catalogStyles.hint}>Загрузка…</p>;
  }

  const isDraft = document.status === 'draft';
  const lines = document.lines ?? [];
  const summary = document.summary ?? {
    total: lines.length,
    confirmed: lines.filter((l) => l.confirmed).length,
    missing: lines.filter((l) => !l.confirmed).length,
  };

  async function handleHeaderSubmit(values) {
    await update.mutateAsync(values);
    setEditingHeader(false);
  }

  async function handleComplete() {
    await complete.mutateAsync();
    setConfirmingComplete(false);
  }

  async function handleDeleteDocument() {
    await remove.mutateAsync();
    navigate('/inventory/documents');
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Инвентаризация {document.number}</h1>
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
            <Button onClick={() => setConfirmingComplete(true)}>Завершить</Button>
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
        <div>
          <span className={styles.label}>Найдено</span>
          <span>
            {summary.confirmed} из {summary.total}
          </span>
        </div>
        <div>
          <span className={styles.label}>Расхождение</span>
          <span>{summary.missing}</span>
        </div>
        {document.responsibleUser && (
          <div>
            <span className={styles.label}>Ответственный</span>
            <span>{document.responsibleUser.fullName}</span>
          </div>
        )}
      </div>

      <div className={catalogStyles.header}>
        <h2 className={styles.linesTitle}>Позиции (снимок остатков на момент создания)</h2>
      </div>

      <div className={catalogStyles.tableWrap}>
        <table className={catalogStyles.table}>
          <thead>
            <tr>
              <th>Найден</th>
              <th>Экземпляр</th>
              <th>Модель</th>
              <th>Размер</th>
              {isDraft && canManage && <th aria-label="Действия" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td className={catalogStyles.hint} colSpan={5}>
                  На складе не было позиций в наличии на момент создания документа
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={line.confirmed}
                    disabled={!isDraft || !canManage}
                    onChange={(event) =>
                      updateLine.mutate({
                        lineId: line.id,
                        payload: { confirmed: event.target.checked },
                      })
                    }
                  />
                </td>
                <td>{line.instance?.inventoryNumber}</td>
                <td>{line.instance?.model?.name ?? '—'}</td>
                <td>{line.instance?.size?.value ?? '—'}</td>
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
          fields={updateHeaderFields}
          schema={updateHeaderSchema}
          defaultValues={document}
          onSubmit={handleHeaderSubmit}
          onClose={() => setEditingHeader(false)}
          isSaving={update.isPending}
          error={errorMessage(update)}
        />
      )}

      {confirmingComplete && (
        <Modal title="Завершить сверку?" onClose={() => setConfirmingComplete(false)}>
          <p className={styles.confirmText}>
            Найдено {summary.confirmed} из {summary.total}, расхождение — {summary.missing}. Остатки
            склада не изменятся — решение по расхождению (например, списание) принимается отдельным
            документом. Действие необратимо, после завершения документ нельзя изменить.
          </p>
          {complete.isError && <p className={catalogStyles.formError}>{errorMessage(complete)}</p>}
          <div className={catalogStyles.formActions}>
            <Button variant="secondary" onClick={() => setConfirmingComplete(false)}>
              Отмена
            </Button>
            <Button onClick={handleComplete} disabled={complete.isPending}>
              {complete.isPending ? 'Завершение…' : 'Завершить'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
