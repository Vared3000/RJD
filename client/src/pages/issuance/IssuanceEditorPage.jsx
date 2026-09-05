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
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { useEmployee } from '../../features/employees/model/use-employee-card.js';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { QueryState } from '../../shared/ui/QueryState.jsx';
import { BlockingDocumentsNotice } from '../../shared/ui/BlockingDocumentsNotice.jsx';
import { downloadPrintForm } from '../../features/print-forms/api/print-forms-api.js';
import { downloadAssemblyOrder } from '../../features/issuance/documents/api/issuance-api.js';
import {
  mutationErrorMessage as errorMessage,
  apiErrorDetails,
  parseBlobApiError,
} from '../../shared/lib/parse-api-error.js';
import { useSessionStore } from '../../shared/session/session-store.js';
import { notify } from '../../shared/notifications/notification-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from '../purchases/ReceivingEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};
const LINE_DRAFT_FIELDS = ['modelId', 'sizeId', 'heightSizeId', 'quantity'];

const ISSUANCE_KIND_LABELS = {
  standard: 'Обычная выдача',
  completion: 'Доукомплектовка',
  replacement: 'Плановое переодевание',
};

function lineKey(modelId, sizeId, heightSizeId) {
  return `${modelId}:${sizeId ?? ''}:${heightSizeId ?? ''}`;
}

function byId(items) {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

export function IssuanceEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const documentQuery = useIssuanceDocument(id);
  const { data: document, isLoading } = documentQuery;
  const { update, remove, addLine, updateLine, removeLine, previewKit, post, revise } =
    useIssuanceMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [kitPreview, setKitPreview] = useState(null);
  const [printPending, setPrintPending] = useState('');
  const [printError, setPrintError] = useState('');
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('issuance.manage'),
  );
  const canPrint = useSessionStore((state) => state.user?.permissions?.includes('print_forms.use'));

  // Режим редакции уже проведённого документа (задача 22) — см. подробный
  // комментарий в ReceivingEditorPage.jsx, тот же паттерн: draftHeader/
  // draftLines в локальном стейте до "Сохранить редакцию".
  const [revising, setRevising] = useState(false);
  const [draftHeader, setDraftHeader] = useState(null);
  const [draftLines, setDraftLines] = useState(null);
  const [reviseReason, setReviseReason] = useState('');

  // Единичный запрос по id (не полный список — работников может быть тысяча,
  // см. docs/CUSTOMER_DECISIONS.md), тот же кэш, что и у карточки работника.
  const draftEmployeeQuery = useEmployee(revising ? draftHeader?.employeeId : null);
  const warehousesById = byId(createCatalogHooks('warehouses').useList(false).data);
  const modelsById = byId(createCatalogHooks('nomenclature-models').useList(false).data);
  const sizesById = byId(createCatalogHooks('sizes').useList(false).data);

  if (isLoading || documentQuery.isError || !document) {
    return <QueryState query={documentQuery} />;
  }

  const isDraft = document.status === 'draft';
  const lines = revising ? (draftLines ?? []) : (document.lines ?? []);
  const existingLineKeys = new Set(
    lines.map((line) => lineKey(line.modelId, line.sizeId, line.heightSizeId)),
  );
  const canEdit = (isDraft || revising) && canManage;
  const lastEditor = document.lastRevisedByUser ?? document.postedByUser;

  function resolveLineDisplay(line) {
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
        employeeName: draftEmployeeQuery.data?.fullName ?? '—',
        warehouseName: warehousesById.get(draftHeader.warehouseId)?.name ?? '—',
        documentDate: draftHeader.documentDate,
      }
    : {
        employeeName: document.employee?.fullName ?? '—',
        warehouseName: document.warehouse?.name ?? '—',
        documentDate: document.documentDate,
      };

  function startRevising() {
    setDraftHeader({
      employeeId: document.employeeId,
      warehouseId: document.warehouseId,
      documentDate: document.documentDate,
      note: document.note ?? '',
    });
    setDraftLines(
      (document.lines ?? []).map((line) =>
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

  function handleEditLine(line, index) {
    if (revising) {
      setEditingLine({ index, ...line });
      return;
    }
    setEditingLine(line);
  }

  function handleRemoveLine(line, index) {
    if (revising) {
      setDraftLines((current) => current.filter((_, i) => i !== index));
      return;
    }
    removeLine.mutate(line.id);
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
    const { shortages } = await post.mutateAsync();
    setConfirmingPost(false);
    if (shortages.length > 0) {
      notify.warning(
        `Не хватило остатка по ${shortages.length} ${shortages.length === 1 ? 'позиции' : 'позициям'} — создана задача на доукомплектовку, см. страницу «Задачи»`,
      );
    }
  }

  async function handleDeleteDocument() {
    await remove.mutateAsync();
    navigate('/issuance/documents');
  }

  async function downloadPreservationReceipt(format) {
    setPrintPending(format);
    setPrintError('');
    try {
      await downloadPrintForm('preservation-receipt', { issuanceId: id, format });
    } catch (requestError) {
      setPrintError(await parseBlobApiError(requestError));
    } finally {
      setPrintPending('');
    }
  }

  // Задание на сборку — рабочий документ для склада: что найти и подготовить
  // под текущий набор позиций черновика, ещё до проведения (экземпляры на
  // черновике не подобраны — это происходит только при "Провести").
  async function downloadAssembly() {
    setPrintPending('assembly');
    setPrintError('');
    try {
      await downloadAssemblyOrder(id, 'pdf');
    } catch (requestError) {
      setPrintError(await parseBlobApiError(requestError));
    } finally {
      setPrintPending('');
    }
  }

  const reviseBlockingDocuments = apiErrorDetails(revise.error)?.blockingDocuments ?? [];

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Выдача {document.number}</h1>
          <p className={styles.subtitle}>
            {STATUS_LABELS[document.status] ?? document.status}
            {` · ${ISSUANCE_KIND_LABELS[document.issuanceKind] ?? 'Обычная выдача'}`}
            {document.status === 'posted' && ` · Редакция №${document.revisionNumber ?? 1}`}
            {document.status === 'posted' &&
              lastEditor &&
              ` · ${document.lastRevisedByUser ? 'изменил' : 'провёл'}: ${lastEditor.fullName}`}
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
            <Button
              variant="secondary"
              onClick={downloadAssembly}
              disabled={lines.length === 0 || Boolean(printPending)}
            >
              {printPending === 'assembly' ? 'Формирование…' : 'Отдать в сборку'}
            </Button>
            <Button variant="danger" onClick={handleDeleteDocument} disabled={remove.isPending}>
              Удалить черновик
            </Button>
            <Button onClick={() => setConfirmingPost(true)} disabled={lines.length === 0}>
              Провести
            </Button>
          </div>
        )}
        {!isDraft && !revising && (canManage || canPrint) && (
          <div className={styles.headerActions}>
            {canPrint && (
              <>
                <Button
                  onClick={() => downloadPreservationReceipt('xlsx')}
                  disabled={Boolean(printPending)}
                >
                  {printPending === 'xlsx' ? 'Формирование…' : 'Сохранная расписка Excel'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => downloadPreservationReceipt('pdf')}
                  disabled={Boolean(printPending)}
                >
                  {printPending === 'pdf' ? 'Формирование…' : 'Сохранная расписка PDF'}
                </Button>
              </>
            )}
            {canManage && (
              <Button variant="secondary" onClick={startRevising}>
                Редактировать
              </Button>
            )}
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

      {printError && <p className={catalogStyles.formError}>{printError}</p>}

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
          <span className={styles.label}>Работник</span>
          <span>{header.employeeName}</span>
        </div>
        {!revising && (
          <div>
            <span className={styles.label}>Должность</span>
            <span>{document.employee?.position?.name ?? 'Не указана'}</span>
          </div>
        )}
        <div>
          <span className={styles.label}>Склад</span>
          <span>{header.warehouseName}</span>
        </div>
        <div>
          <span className={styles.label}>Дата</span>
          <span>{header.documentDate}</span>
        </div>
        {!revising && document.responsibleUser && (
          <div>
            <span className={styles.label}>Ответственный</span>
            <span>{document.responsibleUser.fullName}</span>
          </div>
        )}
      </div>

      {!revising && (
        <>
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
        </>
      )}

      {previewKit.isError && <p className={catalogStyles.formError}>{errorMessage(previewKit)}</p>}
      {kitPreview && isDraft && (
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
        {canEdit && (
          <Button onClick={() => setEditingLine(revising ? { index: null } : {})}>
            + Добавить позицию
          </Button>
        )}
      </div>

      <IssuanceLinesTable
        lines={lines}
        editable={canEdit}
        resolveDisplay={resolveLineDisplay}
        onEditLine={handleEditLine}
        onRemoveLine={handleRemoveLine}
        isRemoving={removeLine.isPending}
        showAvailability={isDraft && !revising}
      />

      {editingHeader && (
        <EntityFormModal
          title="Изменить шапку документа"
          fields={headerFields}
          schema={headerSchema}
          defaultValues={revising ? draftHeader : document}
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
            После проведения система подберёт доступные экземпляры на складе под каждую позицию,
            переведёт их в статус «Выдан» с привязкой к работнику и создаст движения склада. Если
            остатка не хватит — выдастся сколько есть, а на недостающее количество создастся задача
            на доукомплектовку (страница «Задачи»). Документ станет недоступен для изменения.
            Действие необратимо.
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
