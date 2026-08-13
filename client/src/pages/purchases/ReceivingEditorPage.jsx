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
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { QueryState } from '../../shared/ui/QueryState.jsx';
import { BlockingDocumentsNotice } from '../../shared/ui/BlockingDocumentsNotice.jsx';
import {
  mutationErrorMessage as errorMessage,
  apiErrorDetails,
} from '../../shared/lib/parse-api-error.js';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './ReceivingEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

const LINE_DRAFT_FIELDS = [
  'modelId',
  'sizeId',
  'heightSizeId',
  'quantity',
  'purchasePrice',
  'employeeCost',
  'vatRate',
];

function byId(items) {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

export function ReceivingEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const documentQuery = useReceivingDocument(id);
  const { data: receivingDocument, isLoading } = documentQuery;
  const { update, remove, addLine, updateLine, removeLine, post, revise } =
    useReceivingMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('purchases.manage'),
  );

  // Режим редакции уже проведённого документа (задача 22) — draftHeader/
  // draftLines живут только в локальном стейте, пока пользователь не нажмёт
  // "Сохранить редакцию"; те же EntityFormModal, что и у черновика, только
  // их onSubmit пишет в этот стейт вместо вызова API немедленно.
  const [revising, setRevising] = useState(false);
  const [draftHeader, setDraftHeader] = useState(null);
  const [draftLines, setDraftLines] = useState(null);
  const [reviseReason, setReviseReason] = useState('');

  // Для отображения названий модели/размера/поставщика/склада по id, пока
  // draftHeader/draftLines хранят только сырые id (без populated-подобъектов,
  // которые есть у receivingDocument с сервера) — те же справочники, что уже
  // грузят select-поля модалок, кэш react-query переиспользуется без лишних запросов.
  const suppliersById = byId(createCatalogHooks('suppliers').useList(false).data);
  const warehousesById = byId(createCatalogHooks('warehouses').useList(false).data);
  const modelsById = byId(createCatalogHooks('nomenclature-models').useList(false).data);
  const sizesById = byId(createCatalogHooks('sizes').useList(false).data);

  if (isLoading || documentQuery.isError || !receivingDocument) {
    return <QueryState query={documentQuery} />;
  }

  const isDraft = receivingDocument.status === 'draft';
  const lines = revising ? (draftLines ?? []) : (receivingDocument.lines ?? []);
  const totalSum = lines.reduce((sum, line) => sum + line.quantity * Number(line.purchasePrice), 0);

  function lineDisplay(line) {
    if (!revising) {
      return {
        modelName: line.model?.name,
        sizeLabel: line.size
          ? `${SIZE_TYPE_LABELS[line.size.type] ?? line.size.type}: ${line.size.value}`
          : '—',
        heightLabel: line.heightSize?.value ?? '—',
      };
    }
    const model = modelsById.get(line.modelId);
    const size = sizesById.get(line.sizeId);
    const heightSize = sizesById.get(line.heightSizeId);
    return {
      modelName: model?.name,
      sizeLabel: size ? `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}` : '—',
      heightLabel: heightSize?.value ?? '—',
    };
  }

  const header = revising
    ? {
        supplierName: suppliersById.get(draftHeader.supplierId)?.name ?? '—',
        warehouseName: warehousesById.get(draftHeader.warehouseId)?.name ?? '—',
        documentDate: draftHeader.documentDate,
        contractNumber: draftHeader.contractNumber,
        invoiceNumber: draftHeader.invoiceNumber,
      }
    : {
        supplierName: receivingDocument.supplier?.name ?? '—',
        warehouseName: receivingDocument.warehouse?.name ?? '—',
        documentDate: receivingDocument.documentDate,
        contractNumber: receivingDocument.contractNumber,
        invoiceNumber: receivingDocument.invoiceNumber,
      };

  const canEdit = (isDraft || revising) && canManage;
  const lastEditor = receivingDocument.lastRevisedByUser ?? receivingDocument.postedByUser;

  function startRevising() {
    setDraftHeader({
      supplierId: receivingDocument.supplierId,
      warehouseId: receivingDocument.warehouseId,
      documentDate: receivingDocument.documentDate,
      contractNumber: receivingDocument.contractNumber ?? '',
      invoiceNumber: receivingDocument.invoiceNumber ?? '',
      note: receivingDocument.note ?? '',
    });
    setDraftLines(
      (receivingDocument.lines ?? []).map((line) =>
        Object.fromEntries(LINE_DRAFT_FIELDS.map((field) => [field, line[field]])),
      ),
    );
    setReviseReason('');
    revise.reset();
    setRevising(true);
  }

  function cancelRevising() {
    if (!window.confirm('Отменить редактирование? Несохранённые изменения будут потеряны.')) {
      return;
    }
    setRevising(false);
    setDraftHeader(null);
    setDraftLines(null);
    setReviseReason('');
    revise.reset();
  }

  async function submitRevision() {
    await revise.mutateAsync({
      header: draftHeader,
      lines: draftLines,
      reason: reviseReason || undefined,
    });
    setRevising(false);
    setDraftHeader(null);
    setDraftLines(null);
    setReviseReason('');
  }

  async function handleHeaderSubmit(values) {
    if (revising) {
      setDraftHeader(values);
      setEditingHeader(false);
      return;
    }
    await update.mutateAsync(values);
    setEditingHeader(false);
  }

  async function handleLineSubmit(values) {
    if (revising) {
      setDraftLines((current) =>
        editingLine?.index != null
          ? current.map((line, index) => (index === editingLine.index ? values : line))
          : [...(current ?? []), values],
      );
      setEditingLine(null);
      return;
    }
    if (editingLine?.id) {
      await updateLine.mutateAsync({ lineId: editingLine.id, payload: values });
    } else {
      await addLine.mutateAsync(values);
    }
    setEditingLine(null);
  }

  function handleEditLine(index, line) {
    if (revising) {
      setEditingLine({ index, ...line });
      return;
    }
    setEditingLine(line);
  }

  function handleRemoveLine(index, line) {
    if (revising) {
      setDraftLines((current) => current.filter((_, i) => i !== index));
      return;
    }
    removeLine.mutate(line.id);
  }

  async function handlePost() {
    await post.mutateAsync();
    setConfirmingPost(false);
  }

  async function handleDeleteDocument() {
    await remove.mutateAsync();
    navigate('/purchases/receiving');
  }

  const reviseBlockingDocuments = apiErrorDetails(revise.error)?.blockingDocuments ?? [];

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Поступление {receivingDocument.number}</h1>
          <p className={styles.subtitle}>
            {STATUS_LABELS[receivingDocument.status] ?? receivingDocument.status}
            {receivingDocument.status === 'posted' &&
              ` · Редакция №${receivingDocument.revisionNumber ?? 1}`}
            {receivingDocument.status === 'posted' &&
              lastEditor &&
              ` · ${receivingDocument.lastRevisedByUser ? 'изменил' : 'провёл'}: ${lastEditor.fullName}`}
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
        {!isDraft && canManage && !revising && (
          <div className={styles.headerActions}>
            <Button variant="secondary" onClick={startRevising}>
              Редактировать
            </Button>
          </div>
        )}
        {revising && (
          <div className={styles.headerActions}>
            <Button variant="secondary" onClick={() => setEditingHeader(true)}>
              Изменить шапку
            </Button>
            <Button variant="secondary" onClick={cancelRevising}>
              Отменить
            </Button>
            <Button onClick={submitRevision} disabled={revise.isPending || !draftLines?.length}>
              {revise.isPending ? 'Сохранение…' : 'Сохранить редакцию'}
            </Button>
          </div>
        )}
      </div>

      {revising && (
        <div className={styles.reviseReason}>
          <label htmlFor="reviseReason">Причина (необязательно)</label>
          <textarea
            id="reviseReason"
            className={styles.reviseTextarea}
            value={reviseReason}
            onChange={(event) => setReviseReason(event.target.value)}
          />
        </div>
      )}

      {revise.isError &&
        (reviseBlockingDocuments.length > 0 ? (
          <BlockingDocumentsNotice blockingDocuments={reviseBlockingDocuments} />
        ) : (
          <p className={catalogStyles.formError}>{errorMessage(revise)}</p>
        ))}

      <div className={styles.summary}>
        <div>
          <span className={styles.label}>Поставщик</span>
          <span>{header.supplierName}</span>
        </div>
        <div>
          <span className={styles.label}>Склад</span>
          <span>{header.warehouseName}</span>
        </div>
        <div>
          <span className={styles.label}>Дата</span>
          <span>{header.documentDate}</span>
        </div>
        {header.contractNumber && (
          <div>
            <span className={styles.label}>Договор</span>
            <span>{header.contractNumber}</span>
          </div>
        )}
        {header.invoiceNumber && (
          <div>
            <span className={styles.label}>Накладная</span>
            <span>{header.invoiceNumber}</span>
          </div>
        )}
        {!revising && receivingDocument.responsibleUser && (
          <div>
            <span className={styles.label}>Ответственный</span>
            <span>{receivingDocument.responsibleUser.fullName}</span>
          </div>
        )}
        {!revising && receivingDocument.batch && (
          <div>
            <span className={styles.label}>Партия</span>
            <span>{receivingDocument.batch.code}</span>
          </div>
        )}
      </div>

      <div className={catalogStyles.header}>
        <h2 className={styles.linesTitle}>Позиции</h2>
        {canEdit && (
          <Button onClick={() => setEditingLine(revising ? { index: null } : {})}>
            + Добавить позицию
          </Button>
        )}
      </div>

      <div className={catalogStyles.tableWrap}>
        <table className={catalogStyles.table}>
          <thead>
            <tr>
              <th>Модель</th>
              <th>Размер</th>
              <th>Рост</th>
              <th>Кол-во</th>
              <th>Цена закупки</th>
              <th>Для работника</th>
              <th>НДС, %</th>
              <th>Сумма</th>
              {canEdit && <th aria-label="Действия" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td className={catalogStyles.hint} colSpan={9}>
                  Позиций пока нет
                </td>
              </tr>
            )}
            {lines.map((line, index) => {
              const display = lineDisplay(line);
              return (
                <tr key={line.id ?? index}>
                  <td>{display.modelName}</td>
                  <td>{display.sizeLabel}</td>
                  <td>{display.heightLabel}</td>
                  <td>{line.quantity}</td>
                  <td>{line.purchasePrice} ₽</td>
                  <td>{line.employeeCost != null ? `${line.employeeCost} ₽` : '—'}</td>
                  <td>{line.vatRate != null ? `${line.vatRate}%` : '—'}</td>
                  <td>{(line.quantity * Number(line.purchasePrice)).toFixed(2)} ₽</td>
                  {canEdit && (
                    <td className={catalogStyles.actions}>
                      <button
                        type="button"
                        className={catalogStyles.linkButton}
                        onClick={() => handleEditLine(index, line)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className={catalogStyles.linkButton}
                        disabled={removeLine.isPending}
                        onClick={() => handleRemoveLine(index, line)}
                      >
                        Удалить
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={7} className={styles.totalLabel}>
                  Итого
                </td>
                <td>{totalSum.toFixed(2)} ₽</td>
                {canEdit && <td />}
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
          defaultValues={revising ? draftHeader : receivingDocument}
          onSubmit={handleHeaderSubmit}
          onClose={() => setEditingHeader(false)}
          isSaving={update.isPending}
          error={revising ? null : errorMessage(update)}
        />
      )}

      {editingLine !== null && (
        <EntityFormModal
          title={
            editingLine.id || editingLine.index != null ? 'Изменить позицию' : 'Добавить позицию'
          }
          fields={lineFields}
          schema={lineSchema}
          defaultValues={editingLine}
          onSubmit={handleLineSubmit}
          onClose={() => setEditingLine(null)}
          isSaving={addLine.isPending || updateLine.isPending}
          error={revising ? null : errorMessage(addLine.isError ? addLine : updateLine)}
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
