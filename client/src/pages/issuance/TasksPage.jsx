import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useTasksList,
  useTasksMutations,
} from '../../features/issuance/tasks/model/use-tasks-queries.js';
import { Button } from '../../shared/ui/Button.jsx';
import { formatDate } from '../../shared/lib/format-date.js';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';

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

export function TasksPage() {
  const [status, setStatus] = useState('open');
  const { data: tasks, isLoading } = useTasksList(status);
  const { complete } = useTasksMutations();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Задачи на дособор</h1>
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
                <td className={styles.hint} colSpan={9}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && tasks?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={9}>
                  {status === 'open' ? 'Открытых задач нет' : 'Завершённых задач нет'}
                </td>
              </tr>
            )}
            {tasks?.map((task) => (
              <tr key={task.id}>
                <td>{task.employee?.fullName ?? '—'}</td>
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
                    status === 'open' ? task.createdAt : (task.completedAt ?? task.createdAt),
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
