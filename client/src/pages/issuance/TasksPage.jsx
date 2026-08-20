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

const STATUS_LABELS = {
  open: 'Открытые',
  in_progress: 'В оформлении',
  completed: 'Завершённые',
};

function formatSize(size) {
  if (!size) return '—';
  return `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`;
}

// Релиз Д: группировка теперь по работнику + складу, не только по работнику —
// один документ довыдачи не может относиться к двум складам сразу (см. ТЗ).
function groupByEmployeeAndWarehouse(tasks) {
  const groups = new Map();
  for (const task of tasks ?? []) {
    const key = `${task.employeeId ?? task.employee?.id}:${task.warehouseId ?? task.warehouse?.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        employeeId: task.employeeId,
        employee: task.employee,
        warehouse: task.warehouse,
        items: [],
      });
    }
    groups.get(key).items.push(task);
  }
  return Array.from(groups.values());
}

function fulfilledQuantity(task) {
  return (task.fulfillments ?? []).reduce((sum, f) => sum + Number(f.quantity), 0);
}

export function TasksPage() {
  const [status, setStatus] = useState('open');
  const [expanded, setExpanded] = useState(() => new Set());
  // По умолчанию выбраны все открытые задачи группы — здесь хранятся только
  // ЯВНО снятые пользователем (см. ТЗ "по умолчанию все, разрешить снять
  // отдельные"), чтобы не нужно было синхронизировать состояние с загрузкой.
  const [deselected, setDeselected] = useState(() => new Set());
  const { data: tasks, isLoading } = useTasksList(status);
  const { createDraft } = useTasksMutations();
  const navigate = useNavigate();
  const groups = useMemo(() => groupByEmployeeAndWarehouse(tasks), [tasks]);

  const columnCount = status === 'open' ? 9 : 8;

  function toggle(groupKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  function toggleTask(taskId) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleGroupSelection(group, allSelected) {
    setDeselected((prev) => {
      const next = new Set(prev);
      for (const task of group.items) {
        if (allSelected) next.add(task.id);
        else next.delete(task.id);
      }
      return next;
    });
  }

  async function handleCreateDraft(selectedIds) {
    const document = await createDraft.mutateAsync(selectedIds);
    navigate(`/issuance/documents/${document.id}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Задачи на доукомплектовку</h1>
          <p className={styles.subtitle}>
            Позиции, которых не хватило на складе при выдаче — оформите довыдачу, когда остаток
            появится.
          </p>
        </div>
      </div>

      <div className={styles.filterBar}>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="open">{STATUS_LABELS.open}</option>
          <option value="in_progress">{STATUS_LABELS.in_progress}</option>
          <option value="completed">{STATUS_LABELS.completed}</option>
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
              {status === 'open' && <th aria-label="Выбор" />}
              <th>Работник</th>
              <th>Модель</th>
              <th>Размер</th>
              <th>Рост</th>
              <th>{status === 'completed' ? 'Выдано' : 'Нужно'}</th>
              <th>Документ</th>
              {status === 'in_progress' && <th>Черновик</th>}
              {status === 'completed' && <th>Выдача</th>}
              <th>
                {status === 'open'
                  ? 'Создана'
                  : status === 'in_progress'
                    ? 'Оформлена'
                    : 'Завершена'}
              </th>
              {status === 'open' && <th aria-label="Действия" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={columnCount}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && groups.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={columnCount}>
                  {status === 'open' && 'Открытых задач нет'}
                  {status === 'in_progress' && 'Задач в оформлении нет'}
                  {status === 'completed' && 'Завершённых задач нет'}
                </td>
              </tr>
            )}
            {groups.map((group) => {
              const isOpen = expanded.has(group.key);
              const selectedIds = group.items
                .filter((task) => !deselected.has(task.id))
                .map((task) => task.id);
              const allSelected = status === 'open' && selectedIds.length === group.items.length;
              const someSelected = status === 'open' && selectedIds.length > 0;
              return (
                <Fragment key={group.key}>
                  <tr className={styles.linkRow}>
                    {status === 'open' && (
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected && !allSelected;
                          }}
                          onChange={() => toggleGroupSelection(group, allSelected)}
                          aria-label="Выбрать все позиции работника"
                        />
                      </td>
                    )}
                    <td
                      tabIndex={0}
                      onClick={() => toggle(group.key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggle(group.key);
                        }
                      }}
                    >
                      <span className={taskStyles.chevron}>{isOpen ? '▾' : '▸'}</span>
                      {group.employee?.fullName ?? '—'}
                    </td>
                    <td
                      className={taskStyles.groupMeta}
                      colSpan={columnCount - (status === 'open' ? 3 : 1)}
                    >
                      Склад: {group.warehouse?.name ?? '—'} · Позиций: {group.items.length}
                    </td>
                    {status === 'open' && (
                      <td className={styles.actions}>
                        <Button
                          variant="secondary"
                          disabled={!someSelected || createDraft.isPending}
                          onClick={() => handleCreateDraft(selectedIds)}
                        >
                          {createDraft.isPending ? 'Оформление…' : 'Оформить довыдачу'}
                        </Button>
                      </td>
                    )}
                  </tr>
                  {isOpen &&
                    group.items.map((task) => (
                      <tr key={task.id} className={taskStyles.subRow}>
                        {status === 'open' && (
                          <td>
                            <input
                              type="checkbox"
                              checked={!deselected.has(task.id)}
                              onChange={() => toggleTask(task.id)}
                              aria-label="Выбрать позицию"
                            />
                          </td>
                        )}
                        <td />
                        <td>{task.model?.name ?? '—'}</td>
                        <td>{formatSize(task.size)}</td>
                        <td>{task.heightSize?.value ?? '—'}</td>
                        <td>{status === 'completed' ? fulfilledQuantity(task) : task.quantity}</td>
                        <td>
                          <Link
                            to={`/issuance/documents/${task.sourceDocumentId}`}
                            className={styles.linkButton}
                          >
                            {task.sourceDocument?.number ?? '—'}
                          </Link>
                        </td>
                        {status === 'in_progress' && (
                          <td>
                            {task.draftDocumentId ? (
                              <Link
                                to={`/issuance/documents/${task.draftDocumentId}`}
                                className={styles.linkButton}
                              >
                                {task.draftDocument?.number ?? '—'}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                        )}
                        {status === 'completed' && (
                          <td>
                            {(task.fulfillments ?? []).length === 0
                              ? '—'
                              : task.fulfillments.map((fulfillment, index) => (
                                  <Fragment key={fulfillment.id}>
                                    {index > 0 && ', '}
                                    <Link
                                      to={`/issuance/documents/${fulfillment.documentId}`}
                                      className={styles.linkButton}
                                    >
                                      {fulfillment.document?.number ?? '—'}
                                    </Link>
                                  </Fragment>
                                ))}
                          </td>
                        )}
                        <td>
                          {formatDate(
                            status === 'open'
                              ? task.createdAt
                              : (task.completedAt ?? task.createdAt),
                          )}
                        </td>
                        {status === 'open' && <td />}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
