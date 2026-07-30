import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useIssuanceDocument,
  useIssuanceMutations,
} from '../../features/issuance/documents/model/use-issuance-queries.js';
import {
  headerFields,
  headerSchema,
} from '../../features/issuance/documents/model/header-schema.js';
import { lineFields, lineSchema } from '../../features/issuance/documents/model/line-schema.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from '../purchases/ReceivingEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const SIZE_TYPE_LABELS = { clothing: 'Размер', height: 'Рост', shoe: 'Обувь' };

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось сохранить';
}

export function IssuanceEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: document, isLoading } = useIssuanceDocument(id);
  const { update, remove, addLine, updateLine, removeLine, applyKit, post } =
    useIssuanceMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [kitSkipped, setKitSkipped] = useState(null);
  const canManage = useSessionStore((state) => state.user?.permissions?.includes('issuance.manage'));

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

  async function handleApplyKit() {
    const { skipped } = await applyKit.mutateAsync();
    setKitSkipped(skipped);
  }

  async function handlePost() {
    await post.mutateAsync();
    setConfirmingPost(false);
  }

  async function handleDeleteDocument() {
    await remove.mutateAsync();
    navigate('/issuance/documents');
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Выдача {document.number}</h1>
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
            <Button variant="secondary" onClick={handleApplyKit} disabled={applyKit.isPending}>
              Подобрать комплект
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

      {applyKit.isError && (
        <p className={catalogStyles.formError}>{errorMessage(applyKit)}</p>
      )}
      {kitSkipped && kitSkipped.length > 0 && (
        <p className={catalogStyles.formError}>
          Не подобраны (у работника не указан размер): {kitSkipped.map((s) => s.modelName ?? s.modelId).join(', ')}
        </p>
      )}

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
              {isDraft && canManage && <th aria-label="Действия" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td className={catalogStyles.hint} colSpan={4}>
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
            После проведения система подберёт доступные экземпляры на складе под каждую позицию,
            переведёт их в статус «Выдан» с привязкой к работнику и создаст движения склада.
            Документ станет недоступен для изменения. Действие необратимо.
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
