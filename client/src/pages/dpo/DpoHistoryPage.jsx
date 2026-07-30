import { useParams, Link } from 'react-router-dom';
import { useDpo, useDpoHistory } from '../../features/dpo/model/use-dpo-history.js';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';
import pageStyles from './DpoHistoryPage.module.css';

const FIELD_LABELS = {
  name: 'Краткое наименование',
  fullName: 'Полное наименование',
  code: 'Код',
  address: 'Адрес',
  okpo: 'ОКПО',
  businessUnitCode: 'БЕ',
  directorFullName: 'Ответственное лицо',
  directorBasis: 'Основание полномочий',
  contractNumber: 'Номер договора',
  contractDate: 'Дата договора',
  additionalAgreementNumber: 'Номер доп. соглашения',
  additionalAgreementDate: 'Дата доп. соглашения',
};

function formatValue(value) {
  return value === null || value === undefined || value === '' ? '—' : value;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('ru-RU');
}

export function DpoHistoryPage() {
  const { id } = useParams();
  const { data: dpo } = useDpo(id);
  const { data: history, isLoading } = useDpoHistory(id);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>История изменений: {dpo?.name ?? '…'}</h1>
        <Link to="/dpo" className={styles.linkButton}>
          ← К списку ДПО
        </Link>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Дата изменения</th>
              <th>Кто изменил</th>
              <th>Что изменилось</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={3}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && history?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={3}>
                  Изменений ещё не было
                </td>
              </tr>
            )}
            {history?.map((entry, index) => (
              <tr key={index}>
                <td>{formatDateTime(entry.changedAt)}</td>
                <td>{entry.changedByName ?? '—'}</td>
                <td>
                  <ul className={pageStyles.changesList}>
                    {Object.entries(entry.changes).map(([field, { from, to }]) => (
                      <li key={field}>
                        <strong>{FIELD_LABELS[field] ?? field}</strong>: {formatValue(from)} →{' '}
                        {formatValue(to)}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
