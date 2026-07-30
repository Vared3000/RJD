import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEmployee, useEmployeeProperty } from '../../features/employees/model/use-employee-card.js';
import { useIssuanceList } from '../../features/issuance/documents/model/use-issuance-queries.js';
import { useReturnList } from '../../features/issuance/returns/model/use-return-queries.js';
import { formatTenure } from '../../features/employees/model/format-tenure.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './EmployeeCardPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const DOCUMENT_TYPE_LABELS = { issuance: 'Выдача', return: 'Возврат' };

function formatMoney(value) {
  return value == null ? '—' : `${Number(value).toFixed(2)} ₽`;
}

export function EmployeeCardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: employee, isLoading: isLoadingEmployee } = useEmployee(id);
  const { data: property, isLoading: isLoadingProperty } = useEmployeeProperty(id);
  const { data: issuanceDocuments } = useIssuanceList(id);
  const { data: returnDocuments } = useReturnList(id);

  if (isLoadingEmployee || !employee) {
    return <p className={catalogStyles.hint}>Загрузка…</p>;
  }

  const history = [
    ...(issuanceDocuments ?? []).map((document) => ({ ...document, documentType: 'issuance' })),
    ...(returnDocuments ?? []).map((document) => ({ ...document, documentType: 'return' })),
  ].sort((a, b) => new Date(b.documentDate) - new Date(a.documentDate));

  const instances = property?.instances ?? [];

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <Link to="/employees" className={catalogStyles.linkButton}>
            ← К списку работников
          </Link>
          <h1 className={catalogStyles.title}>{employee.fullName}</h1>
          <p className={styles.subtitle}>
            {employee.position?.name ?? 'Должность не указана'}
            {employee.organization?.name && ` · ${employee.organization.name}`}
            {employee.subdivision?.name && ` · ${employee.subdivision.name}`}
          </p>
        </div>
      </div>

      <div className={styles.summary}>
        <div>
          <span className={styles.label}>Табельный номер</span>
          <span>{employee.personnelNumber ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Дата приёма</span>
          <span>{employee.hireDate}</span>
        </div>
        <div>
          <span className={styles.label}>Стаж</span>
          <span>{formatTenure(employee.hireDate, employee.terminationDate)}</span>
        </div>
        <div>
          <span className={styles.label}>Дата увольнения</span>
          <span>{employee.terminationDate ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Размер одежды</span>
          <span>{employee.clothingSize?.value ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Рост</span>
          <span>{employee.heightSize?.value ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Размер обуви</span>
          <span>{employee.shoeSize?.value ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Телефон</span>
          <span>{employee.phone ?? '—'}</span>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Стоимость имущества</h2>
      <div className={catalogStyles.tableWrap}>
        <table className={catalogStyles.table}>
          <thead>
            <tr>
              <th>Инв. номер</th>
              <th>Модель</th>
              <th>Размер</th>
              <th>Стоимость</th>
              <th>Для работника</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingProperty && (
              <tr>
                <td className={catalogStyles.hint} colSpan={5}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoadingProperty && instances.length === 0 && (
              <tr>
                <td className={catalogStyles.hint} colSpan={5}>
                  Сейчас на руках у работника ничего нет
                </td>
              </tr>
            )}
            {instances.map((instance) => (
              <tr key={instance.id}>
                <td>{instance.inventoryNumber}</td>
                <td>{instance.model?.name ?? '—'}</td>
                <td>{instance.size?.value ?? '—'}</td>
                <td>{formatMoney(instance.cost)}</td>
                <td>{formatMoney(instance.employeeCost)}</td>
              </tr>
            ))}
          </tbody>
          {instances.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} className={styles.totalLabel}>
                  Итого
                </td>
                <td>{formatMoney(property.totalCost)}</td>
                <td>{formatMoney(property.totalEmployeeCost)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <h2 className={styles.sectionTitle}>История выдач и возвратов</h2>
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
    </div>
  );
}
