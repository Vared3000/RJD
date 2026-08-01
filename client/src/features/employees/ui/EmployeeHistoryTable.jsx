import { useNavigate } from 'react-router-dom';
import catalogStyles from '../../catalogs/ui/CatalogPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const DOCUMENT_TYPE_LABELS = { issuance: 'Выдача', return: 'Возврат' };

export function EmployeeHistoryTable({ history }) {
  const navigate = useNavigate();

  return (
    <div className={catalogStyles.tableWrap}>
      <table className={catalogStyles.table}>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Тип</th>
            <th>Номер</th>
            <th>Склад</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {history.length === 0 && (
            <tr>
              <td className={catalogStyles.hint} colSpan={5}>
                Документов пока нет
              </td>
            </tr>
          )}
          {history.map((document) => (
            <tr
              key={document.id}
              className={catalogStyles.linkRow}
              onClick={() =>
                navigate(
                  document.documentType === 'issuance'
                    ? `/issuance/documents/${document.id}`
                    : `/issuance/returns/${document.id}`,
                )
              }
            >
              <td>{document.documentDate}</td>
              <td>{DOCUMENT_TYPE_LABELS[document.documentType]}</td>
              <td>{document.number}</td>
              <td>{document.warehouse?.name ?? '—'}</td>
              <td>
                <span
                  className={
                    document.status === 'posted' ? catalogStyles.active : catalogStyles.archived
                  }
                >
                  {STATUS_LABELS[document.status] ?? document.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
