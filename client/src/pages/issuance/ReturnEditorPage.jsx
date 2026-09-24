import { useEffect, useRef, useState } from 'react';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
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
import { QueryState } from '../../shared/ui/QueryState.jsx';
import { UnpostDocumentModal } from '../../shared/ui/UnpostDocumentModal.jsx';
import { mutationErrorMessage as errorMessage } from '../../shared/lib/parse-api-error.js';
import { useSessionStore } from '../../shared/session/session-store.js';
import { LAUNDRY_REPAIR_ENABLED } from '../../shared/config/features.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from '../purchases/ReceivingEditorPage.module.css';
import returnStyles from './ReturnEditorPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const CONDITION_LABELS = { new: 'Новое', good: 'Хорошее', worn: 'Изношено', damaged: 'Повреждено' };
const ROUTE_TO_LABELS = { in_stock: 'На склад', laundry: 'В стирку', repair: 'В ремонт' };
const ROUTE_TO_OPTIONS = Object.entries(ROUTE_TO_LABELS).filter(
  ([value]) => LAUNDRY_REPAIR_ENABLED || value === 'in_stock',
);

// Строка возврата — не универсальная форма-конструктор (EntityFormModal):
// выбор ограничен экземплярами, реально выданными работнику из шапки
// документа (GET /issuance/returns/available), поэтому список опций
// зависит от документа, а не от статичного справочника.
function instanceSizeLabel(instance) {
  if (!instance.size) return 'Без размера';
  return `${instance.size.value}${instance.heightSize ? ` / рост ${instance.heightSize.value}` : ''}`;
}

function AddLineModal({
  employeeId,
  warehouseId,
  existingInstanceIds,
  selectAllInitially,
  onSubmit,
  onClose,
  isSaving,
  error,
}) {
  const { data: instances, isLoading } = useAvailableInstances(employeeId);
  const [selectedIds, setSelectedIds] = useState([]);
  const [condition, setCondition] = useState('good');
  const [routeTo, setRouteTo] = useState('in_stock');
  const [note, setNote] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState(warehouseId);
  const warehousesQuery = createCatalogHooks('issuance/returns/warehouse-options').useList(false);
  const warehouses = warehousesQuery.data ?? [];
  const organizationId = warehouses.find(
    (warehouse) => warehouse.id === warehouseId,
  )?.organizationId;
  const destinations = warehouses.filter(
    (warehouse) => warehouse.organizationId === organizationId,
  );
  const primary = destinations.find((warehouse) => warehouse.isPrimaryForReturns);
  const destinationId = condition === 'new' ? primary?.id : targetWarehouseId;
  const initialSelectionApplied = useRef(false);

  const availableInstances = (instances ?? []).filter(
    (instance) => !existingInstanceIds.includes(instance.id),
  );
  const availableIds = availableInstances.map((instance) => instance.id);

  useEffect(() => {
    if (selectAllInitially && !initialSelectionApplied.current && availableIds.length > 0) {
      setSelectedIds(availableIds);
      initialSelectionApplied.current = true;
    }
  }, [availableIds, selectAllInitially]);

  function toggleInstance(instanceId) {
    setSelectedIds((current) =>
      current.includes(instanceId)
        ? current.filter((id) => id !== instanceId)
        : [...current, instanceId],
    );
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      instanceIds: selectedIds,
      condition,
      routeTo,
      note,
      targetWarehouseId: destinationId,
    });
  }

  return (
    <Modal
      title="Выбрать вещи для возврата"
      onClose={onClose}
      closeOnOverlayClick={false}
      size="wide"
    >
      <form className={catalogStyles.form} onSubmit={handleSubmit}>
        {isLoading && <p className={catalogStyles.hint}>Загрузка выданных экземпляров…</p>}
        {!isLoading && availableInstances.length === 0 && (
          <p className={catalogStyles.hint}>У работника нет выданных экземпляров для возврата.</p>
        )}
        {availableInstances.length > 0 && (
          <section className={returnStyles.selectionSection}>
            <div className={returnStyles.selectionToolbar}>
              <strong>Выбрано: {selectedIds.length}</strong>
              <div className={returnStyles.selectionActions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedIds(availableIds)}
                >
                  Выбрать все
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSelectedIds([])}>
                  Снять выбор
                </Button>
              </div>
            </div>
            <div className={returnStyles.instanceList}>
              {availableInstances.map((instance) => (
                <label key={instance.id} className={returnStyles.instanceRow}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(instance.id)}
                    onChange={() => toggleInstance(instance.id)}
                  />
                  <span className={returnStyles.inventoryNumber}>{instance.inventoryNumber}</span>
                  <span>{instance.model?.name ?? '—'}</span>
                  <span>{instanceSizeLabel(instance)}</span>
                </label>
              ))}
            </div>
          </section>
        )}
        <Select
          id="condition"
          label="Состояние при возврате"
          value={condition}
          onChange={(event) => {
            setCondition(event.target.value);
            if (event.target.value === 'new') setRouteTo('in_stock');
          }}
          options={Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Select
          id="routeTo"
          label="Куда направить"
          value={routeTo}
          disabled={condition === 'new'}
          onChange={(event) => setRouteTo(event.target.value)}
          options={ROUTE_TO_OPTIONS.map(([value, label]) => ({ value, label }))}
        />
        <Select
          id="targetWarehouseId"
          label="Склад назначения"
          value={destinationId ?? ''}
          disabled={condition === 'new' || warehousesQuery.isLoading}
          onChange={(event) => setTargetWarehouseId(event.target.value)}
          options={destinations.map((warehouse) => ({
            value: warehouse.id,
            label: warehouse.name,
          }))}
          hint={
            condition === 'new'
              ? 'Новое автоматически возвращается на Основной склад.'
              : 'Выберите склад возвратов или другой склад этой организации.'
          }
        />
        {warehousesQuery.isError && (
          <p className={catalogStyles.formError}>
            Не удалось загрузить склады. Закройте окно и повторите попытку.
          </p>
        )}
        {condition === 'new' && !primary && !warehousesQuery.isLoading && (
          <p className={catalogStyles.formError}>
            Основной склад для новых возвратов не настроен. Назначьте его в справочнике «Склады».
          </p>
        )}
        <TextField
          id="note"
          label="Примечание"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className={catalogStyles.hint}>
          Состояние, направление и примечание применятся ко всем выбранным вещам. Если они
          отличаются, добавьте вещи несколькими группами.
        </p>
        {error && <p className={catalogStyles.formError}>{error}</p>}
        <div className={catalogStyles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={
              isSaving || selectedIds.length === 0 || !destinationId || warehousesQuery.isError
            }
          >
            {isSaving ? 'Добавление…' : `Добавить выбранные (${selectedIds.length})`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ReturnEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const documentQuery = useReturnDocument(id);
  const { data: document, isLoading } = documentQuery;
  const { update, remove, addLines, removeLine, post, unpost } = useReturnMutations(id);
  const [editingHeader, setEditingHeader] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [unpostMode, setUnpostMode] = useState(null);
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('issuance.manage'),
  );
  const canRevise = useSessionStore((state) =>
    state.user?.permissions?.includes('documents.revise'),
  );

  if (isLoading || documentQuery.isError || !document) {
    return <QueryState query={documentQuery} />;
  }

  const isDraft = document.status === 'draft';
  const lines = document.lines ?? [];

  async function handleHeaderSubmit(values) {
    await update.mutateAsync(values);
    setEditingHeader(false);
  }

  async function handleAddLines(values) {
    await addLines.mutateAsync(values);
    setAddingLine(false);
  }

  async function handlePost() {
    await post.mutateAsync();
    setConfirmingPost(false);
  }

  async function handleUnpost(values) {
    const editAfter = unpostMode === 'edit';
    await unpost.mutateAsync(values);
    setUnpostMode(null);
    if (editAfter) setEditingHeader(true);
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
        {!isDraft && canManage && canRevise && (
          <div className={styles.headerActions}>
            <Button variant="secondary" onClick={() => setUnpostMode('edit')}>
              Редактировать
            </Button>
            <Button variant="danger" onClick={() => setUnpostMode('unpost')}>
              Отменить проведение
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
          <div className={styles.headerActions}>
            <Button variant="secondary" onClick={() => setAddingLine({ selectAll: true })}>
              Вернуть всё
            </Button>
            <Button onClick={() => setAddingLine({ selectAll: false })}>+ Выбрать вещи</Button>
          </div>
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
              <th>Склад назначения</th>
              <th>Примечание</th>
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
                <td>{line.instance?.inventoryNumber}</td>
                <td>{line.instance?.model?.name ?? '—'}</td>
                <td>
                  {line.instance?.size
                    ? line.instance.size
                      ? `${line.instance.size.value}${line.instance.heightSize ? `/${line.instance.heightSize.value}` : ''}`
                      : 'Без размера'
                    : '—'}
                </td>
                <td>{CONDITION_LABELS[line.condition] ?? line.condition}</td>
                <td>{ROUTE_TO_LABELS[line.routeTo] ?? line.routeTo}</td>
                <td>{line.targetWarehouse?.name ?? document.warehouse?.name ?? '—'}</td>
                <td>{line.note ?? '—'}</td>
                {isDraft && canManage && (
                  <td className={catalogStyles.actions}>
                    <button
                      type="button"
                      className={catalogStyles.linkButton}
                      disabled={removeLine.isPending}
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
          warehouseId={document.warehouseId}
          existingInstanceIds={lines.map((line) => line.instanceId)}
          selectAllInitially={addingLine.selectAll}
          onSubmit={handleAddLines}
          onClose={() => setAddingLine(false)}
          isSaving={addLines.isPending}
          error={errorMessage(addLines)}
        />
      )}

      {confirmingPost && (
        <Modal title="Провести документ?" onClose={() => setConfirmingPost(false)}>
          <p className={styles.confirmText}>
            Новые вещи поступят на Основной склад, остальные — на склады, указанные в позициях.
            Маршруты стирки и ремонта сохраняются для неновых вещей. Проверьте назначения перед
            подтверждением.
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

      {unpostMode && (
        <UnpostDocumentModal
          editAfter={unpostMode === 'edit'}
          mutation={unpost}
          onConfirm={handleUnpost}
          onClose={() => setUnpostMode(null)}
        />
      )}
    </div>
  );
}
