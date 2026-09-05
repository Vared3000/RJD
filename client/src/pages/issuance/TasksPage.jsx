import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useTasksList,
  useTasksMutations,
} from '../../features/issuance/tasks/model/use-tasks-queries.js';
import { Button } from '../../shared/ui/Button.jsx';
import { formatDate } from '../../shared/lib/format-date.js';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import taskStyles from './TasksPage.module.css';

const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

const WORKFLOW_LABELS = {
  scheduled: 'Запланировано',
  ready: 'Можно собрать',
  waiting_stock: 'Ожидает остатка',
  draft_created: 'Создана выдача',
  completed: 'Завершено',
  overdue: 'Просрочено',
  cancelled: 'Отменено',
};

const TYPE_LABELS = {
  completion: 'Доукомплектовка',
  replacement: 'Плановое переодевание',
};

function formatSize(size) {
  if (!size) return '—';
  return `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`;
}

function groupTasks(tasks) {
  const groups = new Map();
  for (const task of tasks ?? []) {
    const key = [task.employeeId, task.warehouseId, task.taskType].join(':');
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        taskType: task.taskType,
        employee: task.employee,
        warehouse: task.warehouse,
        items: [],
      });
    }
    groups.get(key).items.push(task);
  }
  return [...groups.values()];
}

function fulfilledQuantity(task) {
  return (task.fulfillments ?? []).reduce((sum, item) => sum + Number(item.quantity), 0);
}

function linkedDocuments(task) {
  if (task.draftDocumentId) {
    return (
      <Link to={`/issuance/documents/${task.draftDocumentId}`} className={styles.linkButton}>
        {task.draftDocument?.number ?? 'Открыть выдачу'}
      </Link>
    );
  }
  if ((task.fulfillments ?? []).length > 0) {
    return task.fulfillments.map((item, index) => (
      <Fragment key={item.id}>
        {index > 0 && ', '}
        <Link to={`/issuance/documents/${item.documentId}`} className={styles.linkButton}>
          {item.document?.number ?? 'Выдача'}
        </Link>
      </Fragment>
    ));
  }
  return '—';
}

export function TasksPage() {
  const [status, setStatus] = useState('active');
  const [taskType, setTaskType] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [deselected, setDeselected] = useState(() => new Set());
  const { data: tasks, isLoading } = useTasksList(status, taskType || undefined);
  const { createDraft } = useTasksMutations();
  const navigate = useNavigate();
  const groups = useMemo(() => groupTasks(tasks), [tasks]);
  const actionable = status === 'active';

  function toggleExpanded(key) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleTask(id) {
    setDeselected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(items, allSelected) {
    setDeselected((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (allSelected) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  async function createIssuance(ids) {
    const document = await createDraft.mutateAsync(ids);
    navigate(`/issuance/documents/${document.id}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Задачи на выдачу и переодевание</h1>
          <p className={styles.subtitle}>
            Здесь видны недостающие позиции и вещи, которые пора заменить по сроку износа.
          </p>
        </div>
      </div>

      <div className={styles.filterBar}>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="active">Требуют внимания</option>
          <option value="in_progress">Создана выдача</option>
          <option value="completed">Завершённые</option>
          <option value="cancelled">Отменённые</option>
        </select>
        <select value={taskType} onChange={(event) => setTaskType(event.target.value)}>
          <option value="">Все типы</option>
          <option value="completion">Доукомплектовка</option>
          <option value="replacement">Плановое переодевание</option>
        </select>
      </div>

      <div className={styles.summaryBar}>
        <span className={styles.summaryItem}>
          Найдено: <strong>{tasks?.length ?? 0}</strong>
        </span>
        <span className={styles.summaryItem}>
          Работников: <strong>{groups.length}</strong>
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th aria-label="Выбор" />
              <th>Работник</th>
              <th>Модель</th>
              <th>Размер</th>
              <th>Рост</th>
              <th>Нужно</th>
              <th>На складе</th>
              <th>Состояние</th>
              <th>Дата замены</th>
              <th>Исходная выдача</th>
              <th>Связанная выдача</th>
              <th>Создано</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={12}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && groups.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={12}>
                  Задач в выбранном разделе нет
                </td>
              </tr>
            )}
            {groups.map((group) => {
              const isOpen = expanded.has(group.key);
              const selectable = group.items.filter((item) => Number(item.assemblyQuantity) > 0);
              const selectedIds = selectable
                .filter((item) => !deselected.has(item.id))
                .map((item) => item.id);
              const allSelected =
                selectedIds.length > 0 && selectedIds.length === selectable.length;
              return (
                <Fragment key={group.key}>
                  <tr className={styles.linkRow}>
                    <td>
                      {actionable && selectable.length > 0 && (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleGroup(selectable, allSelected)}
                          aria-label="Выбрать доступные позиции работника"
                        />
                      )}
                    </td>
                    <td
                      tabIndex={0}
                      onClick={() => toggleExpanded(group.key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleExpanded(group.key);
                        }
                      }}
                    >
                      <span className={taskStyles.chevron}>{isOpen ? '▾' : '▸'}</span>
                      {group.employee?.fullName ?? '—'}
                    </td>
                    <td className={taskStyles.groupMeta} colSpan={9}>
                      {TYPE_LABELS[group.taskType] ?? group.taskType} · Должность:{' '}
                      {group.employee?.position?.name ?? 'не указана'} · ДПО:{' '}
                      {group.employee?.dpo?.name ?? 'не указано'} · Склад:{' '}
                      {group.warehouse?.name ?? '—'}
                    </td>
                    <td className={styles.actions}>
                      {actionable && (
                        <Button
                          variant="secondary"
                          disabled={selectedIds.length === 0 || createDraft.isPending}
                          onClick={() => createIssuance(selectedIds)}
                        >
                          {createDraft.isPending
                            ? 'Оформление…'
                            : group.taskType === 'replacement'
                              ? 'Оформить переодевание'
                              : 'Оформить довыдачу'}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {isOpen &&
                    group.items.map((task) => {
                      const canSelect = actionable && Number(task.assemblyQuantity) > 0;
                      return (
                        <tr key={task.id} className={taskStyles.subRow}>
                          <td>
                            {actionable && (
                              <input
                                type="checkbox"
                                checked={canSelect && !deselected.has(task.id)}
                                disabled={!canSelect}
                                onChange={() => toggleTask(task.id)}
                                aria-label="Выбрать позицию"
                              />
                            )}
                          </td>
                          <td />
                          <td>{task.model?.name ?? '—'}</td>
                          <td>{formatSize(task.size)}</td>
                          <td>{task.heightSize?.value ?? '—'}</td>
                          <td>
                            {task.status === 'completed' ? fulfilledQuantity(task) : task.quantity}
                          </td>
                          <td>{task.availableQuantity ?? '—'}</td>
                          <td>{WORKFLOW_LABELS[task.workflowStatus] ?? task.workflowStatus}</td>
                          <td>
                            {task.plannedReplacementDate
                              ? formatDate(task.plannedReplacementDate)
                              : '—'}
                            {task.daysRemaining != null && ` (${task.daysRemaining} дн.)`}
                          </td>
                          <td>
                            <Link
                              to={`/issuance/documents/${task.sourceDocumentId}`}
                              className={styles.linkButton}
                            >
                              {task.sourceDocument?.number ?? 'Открыть'}
                            </Link>
                            {task.sourceInstance?.inventoryNumber && (
                              <> · {task.sourceInstance.inventoryNumber}</>
                            )}
                            {task.issuedAt && <> · выдано {formatDate(task.issuedAt)}</>}
                            {task.serviceLifeYearsSnapshot && (
                              <> · срок {task.serviceLifeYearsSnapshot} г.</>
                            )}
                          </td>
                          <td>{linkedDocuments(task)}</td>
                          <td>{formatDate(task.createdAt)}</td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
