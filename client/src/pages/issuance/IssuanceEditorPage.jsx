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
import { KitPreviewPanel } from '../../features/issuance/documents/ui/KitPreviewPanel.jsx';
import { IssuanceLinesTable } from '../../features/issuance/documents/ui/IssuanceLinesTable.jsx';
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

function lineKey(modelId, sizeId, heightSizeId) {
  return `${modelId}:${sizeId ?? ''}:${heightSizeId ?? ''}`;
}

export function IssuanceEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: document, isLoading } = useIssuanceDocument(id);
  const { update, remove, addLine, updateLine, removeLine, previewKit, post } =
    useIssuanceMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [kitPreview, setKitPreview] = useState(null);
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('issuance.manage'),
  );

  if (isLoading || !document) {
    return <p className={catalogStyles.hint}>Загрузка…</p>;
  }

  const isDraft = document.status === 'draft';
  const lines = document.lines ?? [];
  const existingLineKeys = new Set(
    lines.map((line) => lineKey(line.modelId, line.sizeId, line.heightSizeId)),
  );

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

  async function handlePreviewKit(season) {
    const result = await previewKit.mutateAsync(season);
    setKitPreview({ ...result, season });
  }

  async function handleAddKitItem(item) {
    await addLine.mutateAsync({
      modelId: item.modelId,
      sizeId: item.sizeId,
      heightSizeId: item.heightSizeId,
      quantity: item.quantity,
    });
  }

  function handleRemovePreviewItem(index) {
    setKitPreview((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleAddAllKitItems() {
    const addable = kitPreview.items.filter(
      (item) =>
        !item.missingSize &&
        !existingLineKeys.has(lineKey(item.modelId, item.sizeId, item.heightSizeId)),
    );
    for (const item of addable) {
      await handleAddKitItem(item);
    }
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
            <Button
              variant="secondary"
              onClick={() => handlePreviewKit('summer')}
              disabled={previewKit.isPending}
            >
              Летний комплект
            </Button>
            <Button
              variant="secondary"
              onClick={() => handlePreviewKit('winter')}
              disabled={previewKit.isPending}
            >
              Зимний комплект
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
          <span className={styles.label}>Должность</span>
          <span>{document.employee?.position?.name ?? 'Не указана'}</span>
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

      <h2 className={styles.linesTitle}>Размеры работника</h2>
      <div className={styles.summary}>
        <div>
          <span className={styles.label}>Одежда</span>
          <span>{document.employee?.clothingSize?.value ?? 'Не указан'}</span>
        </div>
        <div>
          <span className={styles.label}>Рост</span>
          <span>{document.employee?.heightSize?.value ?? 'Не указан'}</span>
        </div>
        <div>
          <span className={styles.label}>Обувь</span>
          <span>{document.employee?.shoeSize?.value ?? 'Не указан'}</span>
        </div>
        <div>
          <span className={styles.label}>Головной убор</span>
          <span>{document.employee?.headwearSize?.value ?? 'Не указан'}</span>
        </div>
        <div>
          <span className={styles.label}>Ремень</span>
          <span>{document.employee?.beltSize?.value ?? 'Не указан'}</span>
        </div>
        <div>
          <span className={styles.label}>Перчатки</span>
          <span>{document.employee?.glovesSize?.value ?? 'Не указан'}</span>
        </div>
      </div>

      {previewKit.isError && <p className={catalogStyles.formError}>{errorMessage(previewKit)}</p>}
      {kitPreview && (
        <KitPreviewPanel
          kitPreview={kitPreview}
          isDraft={isDraft}
          canManage={canManage}
          existingLineKeys={existingLineKeys}
          lineKey={lineKey}
          isAddingLine={addLine.isPending}
          onAddItem={handleAddKitItem}
          onAddAllItems={handleAddAllKitItems}
          onRemoveItem={handleRemovePreviewItem}
          onHide={() => setKitPreview(null)}
        />
      )}

      <div className={catalogStyles.header}>
        <h2 className={styles.linesTitle}>Позиции</h2>
        {isDraft && canManage && (
          <Button onClick={() => setEditingLine({})}>+ Добавить позицию</Button>
        )}
      </div>

      <IssuanceLinesTable
        lines={lines}
        isDraft={isDraft}
        canManage={canManage}
        onEditLine={setEditingLine}
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
