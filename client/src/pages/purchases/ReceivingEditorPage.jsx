import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useReceivingDocument,
  useReceivingMutations,
} from '../../features/purchases/receiving/model/use-receiving-queries.js';
import {
  headerFields,
  headerSchema,
} from '../../features/purchases/receiving/model/header-schema.js';
import { lineFields, lineSchema } from '../../features/purchases/receiving/model/line-schema.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './ReceivingEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const SIZE_TYPE_LABELS = { clothing: 'Размер', height: 'Рост', shoe: 'Обувь' };

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось сохранить';
}

export function ReceivingEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: receivingDocument, isLoading } = useReceivingDocument(id);
  const { update, remove, addLine, updateLine, removeLine, post } = useReceivingMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('purchases.manage'),
  );

  if (isLoading || !receivingDocument) {
    return <p className={catalogStyles.hint}>Загрузка…</p>;
  }

  const isDraft = receivingDocument.status === 'draft';
  const lines = receivingDocument.lines ?? [];
  const totalSum = lines.reduce((sum, line) => sum + line.quantity * Number(line.purchasePrice), 0);

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
    navigate('/purchases/receiving');
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Поступление {receivingDocument.number}</h1>
          <p className={styles.subtitle}>
            {STATUS_LABELS[receivingDocument.status] ?? receivingDocument.status}
            {receivingDocument.status === 'posted' &&
              receivingDocument.postedByUser &&
              ` · ${receivingDocument.postedByUser.fullName}`}
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
          <span className={styles.label}>Поставщик</span>
          <span>{receivingDocument.supplier?.name ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Склад</span>
          <span>{receivingDocument.warehouse?.name ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Дата</span>
          <span>{receivingDocument.documentDate}</span>
        </div>
        {receivingDocument.contractNumber && (
          <div>
            <span className={styles.label}>Договор</span>
            <span>{receivingDocument.contractNumber}</span>
          </div>
        )}
        {receivingDocument.invoiceNumber && (
          <div>
            <span className={styles.label}>Накладная</span>
            <span>{receivingDocument.invoiceNumber}</span>
          </div>
        )}
        {receivingDocument.responsibleUser && (
          <div>
            <span className={styles.label}>Ответственный</span>
            <span>{receivingDocument.responsibleUser.fullName}</span>
          </div>
        )}
        {receivingDocument.batch && (
          <div>
            <span className={styles.label}>Партия</span>
            <span>{receivingDocument.batch.code}</span>
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
              <th>Модель</th>
              <th>Размер</th>
              <th>Кол-во</th>
              <th>Цена закупки</th>
              <th>Для работника</th>
              <th>НДС, %</th>
              <th>Сумма</th>
              {isDraft && canManage && <th aria-label="Действия" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td className={catalogStyles.hint} colSpan={8}>
                  Позиций пока нет
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.model?.name}</td>
                <td>
                  {line.size
                    ? `${SIZE_TYPE_LABELS[line.size.type] ?? line.size.type}: ${line.size.value}`
                    : '—'}
                </td>
                <td>{line.quantity}</td>
                <td>{line.purchasePrice} ₽</td>
                <td>{line.employeeCost != null ? `${line.employeeCost} ₽` : '—'}</td>
                <td>{line.vatRate != null ? `${line.vatRate}%` : '—'}</td>
                <td>{(line.quantity * Number(line.purchasePrice)).toFixed(2)} ₽</td>
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
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} className={styles.totalLabel}>
                  Итого
                </td>
                <td>{totalSum.toFixed(2)} ₽</td>
                {isDraft && canManage && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editingHeader && (
        <EntityFormModal
          title="Изменить шапку документа"
          fields={headerFields}
          schema={headerSchema}
          defaultValues={receivingDocument}
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
            После проведения будут созданы экземпляры спецодежды и движения склада, документ станет
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
