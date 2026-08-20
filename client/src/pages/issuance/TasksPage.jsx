import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

function formatSize(size) {
  if (!size) return '—';
  return `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`;
}

function groupByEmployee(tasks) {
  const groups = new Map();
  for (const task of tasks ?? []) {
    const key = task.employeeId ?? task.employee?.id ?? task.id;
    if (!groups.has(key)) {
      groups.set(key, { employeeId: key, employee: task.employee, items: [] });
    }
    groups.get(key).items.push(task);
  }
  return Array.from(groups.values());
}

export function TasksPage() {
  const [status, setStatus] = useState('open');
  const [expanded, setExpanded] = useState(() => new Set());
  const { data: tasks, isLoading } = useTasksList(status);
  const { complete } = useTasksMutations();
  const groups = useMemo(() => groupByEmployee(tasks), [tasks]);
  const columnCount = status === 'open' ? 9 : 8;

  function toggle(employeeId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Задачи на доукомплектовку</h1>
          <p className={styles.subtitle}>
            Позиции, которых не хватило на складе при выдаче — довыдаются, когда остаток появится.
          </p>
        </div>
      </div>

      <div className={styles.filterBar}>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="open">Открытые</option>
          <option value="completed">Завершённые</option>
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
              <th>Работник</th>
              <th>Модель</th>
              <th>Размер</th>
              <th>Рост</th>
              <th>Нужно</th>
              <th>Склад</th>
              <th>Документ</th>
              <th>{status === 'open' ? 'Создана' : 'Завершена'}</th>
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
                  {status === 'open' ? 'Открытых задач нет' : 'Завершённых задач нет'}
                </td>
              </tr>
            )}
            {groups.map((group) => {
              const isOpen = expanded.has(group.employeeId);
              return (
                <Fragment key={group.employeeId}>
                  <tr
                    className={styles.linkRow}
                    tabIndex={0}
                    onClick={() => toggle(group.employeeId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggle(group.employeeId);
                      }
                    }}
                  >
                    <td>
                      <span className={taskStyles.chevron}>{isOpen ? '▾' : '▸'}</span>
                      {group.employee?.fullName ?? '—'}
                    </td>
                    <td className={taskStyles.groupMeta} colSpan={columnCount - 1}>
                      Позиций: {group.items.length}
                    </td>
                  </tr>
                  {isOpen &&
                    group.items.map((task) => (
                      <tr key={task.id} className={taskStyles.subRow}>
                        <td />
                        <td>{task.model?.name ?? '—'}</td>
                        <td>{formatSize(task.size)}</td>
                        <td>{task.heightSize?.value ?? '—'}</td>
                        <td>{task.quantity}</td>
                        <td>{task.warehouse?.name ?? '—'}</td>
                        <td>
                          <Link
                            to={`/issuance/documents/${task.sourceDocumentId}`}
                            className={styles.linkButton}
                          >
                            {task.sourceDocument?.number ?? '—'}
                          </Link>
                          {status === 'completed' && task.fulfillingDocument && (
                            <>
                              {' → '}
                              <Link
                                to={`/issuance/documents/${task.fulfillingDocumentId}`}
                                className={styles.linkButton}
                              >
                                {task.fulfillingDocument.number}
                              </Link>
                            </>
                          )}
                        </td>
                        <td>
                          {formatDate(
                            status === 'open'
                              ? task.createdAt
                              : (task.completedAt ?? task.createdAt),
                          )}
                        </td>
                        {status === 'open' && (
                          <td className={styles.actions}>
                            <Button
                              variant="secondary"
                              onClick={() => complete.mutate(task.id)}
                              disabled={complete.isPending}
                            >
                              {complete.isPending && complete.variables === task.id
                                ? 'Завершение…'
                                : 'Завершить'}
                            </Button>
                          </td>
                        )}
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
