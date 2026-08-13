import { Link, useParams } from 'react-router-dom';
import {
  useInstance,
  useInstanceHistory,
} from '../../features/instances/model/use-instance-history.js';
import { QueryState } from '../../shared/ui/QueryState.jsx';
import { parseApiError } from '../../shared/lib/parse-api-error.js';
import { DOCUMENT_PATHS } from '../../shared/lib/document-type-labels.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './InstanceCardPage.module.css';

const STATUS_LABELS = {
  in_stock: 'На складе',
  issued: 'Выдан',
  laundry: 'В стирке',
  repair: 'В ремонте',
  write_off: 'Списан',
};

const CONDITION_LABELS = {
  new: 'Новое',
  good: 'Хорошее',
  worn: 'Изношено',
  damaged: 'Повреждено',
};

const EVENT_LABELS = {
  receiving: 'Поступление',
  issuance: 'Выдача работнику',
  return: 'Возврат',
  laundry_sent: 'Отправка в стирку',
  laundry_completed: 'Возврат из стирки',
  repair_sent: 'Отправка в ремонт',
  repair_completed: 'Возврат из ремонта',
  transfer: 'Перемещение',
  inventory_discrepancy: 'Расхождение инвентаризации',
  adjustment: 'Корректировка',
  writeoff: 'Списание',
};

function stateText(status, condition) {
  return [STATUS_LABELS[status] ?? status, CONDITION_LABELS[condition] ?? condition]
    .filter(Boolean)
    .join(', ');
}

function locationText(warehouse, employee) {
  if (employee) return `Работник: ${employee.fullName}`;
  if (warehouse) return `Склад: ${warehouse.name}`;
  return 'Вне склада';
}

function documentLink(event) {
  const basePath = DOCUMENT_PATHS[event.documentType];
  if (!basePath || !event.documentId) return '—';
  return (
    <Link to={`${basePath}/${event.documentId}`} className={catalogStyles.linkButton}>
      {event.details?.documentNumber ?? 'Открыть документ'}
    </Link>
  );
}

export function InstanceCardPage() {
  const { id } = useParams();
  const instanceQuery = useInstance(id);
  const { data: instance, isLoading: instanceLoading } = instanceQuery;
  const historyQuery = useInstanceHistory(id);
  const { data: history, isLoading: historyLoading } = historyQuery;

  if (instanceLoading || instanceQuery.isError || !instance) {
    return <QueryState query={instanceQuery} />;
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <Link to="/nomenclature/instances" className={catalogStyles.linkButton}>
            ← К списку экземпляров
          </Link>
          <h1 className={catalogStyles.title}>Экземпляр {instance.inventoryNumber}</h1>
        </div>
      </div>

      <dl className={styles.summary}>
        <div>
          <dt>Модель</dt>
          <dd>{instance.model?.name ?? '—'}</dd>
        </div>
        <div>
          <dt>Размер</dt>
          <dd>{instance.size?.value ?? '—'}</dd>
        </div>
        <div>
          <dt>Рост</dt>
          <dd>{instance.heightSize?.value ?? '—'}</dd>
        </div>
        <div>
          <dt>Текущее состояние</dt>
          <dd>{stateText(instance.status, instance.condition)}</dd>
        </div>
        <div>
          <dt>Местонахождение</dt>
          <dd>{locationText(instance.warehouse, instance.employee)}</dd>
        </div>
        <div>
          <dt>Стоимость</dt>
          <dd>{instance.cost != null ? `${instance.cost} ₽` : '—'}</dd>
        </div>
      </dl>

      <section>
        <h2 className={styles.sectionTitle}>Жизненный цикл</h2>
        <div className={catalogStyles.tableWrap}>
          <table className={catalogStyles.table}>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Событие</th>
                <th>Изменение</th>
                <th>Документ</th>
                <th>Кто выполнил</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && (
                <tr>
                  <td colSpan={5} className={catalogStyles.hint}>
                    Загрузка…
                  </td>
                </tr>
              )}
              {historyQuery.isError && (
                <tr>
                  <td colSpan={5}>
                    <div className={catalogStyles.errorRow}>
                      <span>{parseApiError(historyQuery.error).message}</span>
                      <button
                        type="button"
                        className={catalogStyles.linkButton}
                        onClick={() => historyQuery.refetch()}
                      >
                        Повторить
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {!historyLoading && !historyQuery.isError && history?.length === 0 && (
                <tr>
                  <td colSpan={5} className={catalogStyles.hint}>
                    Событий пока нет
                  </td>
                </tr>
              )}
              {history?.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.occurredAt).toLocaleString('ru-RU')}</td>
                  <td>{EVENT_LABELS[event.eventType] ?? event.eventType}</td>
                  <td className={styles.change}>
                    <span>
                      {stateText(event.fromStatus, event.fromCondition)} →{' '}
                      {stateText(event.toStatus, event.toCondition)}
                    </span>
                    <span>
                      {locationText(event.fromWarehouse, event.fromEmployee)} →{' '}
                      {locationText(event.toWarehouse, event.toEmployee)}
                    </span>
                  </td>
                  <td>{documentLink(event)}</td>
                  <td>{event.user?.fullName ?? event.user?.login ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
