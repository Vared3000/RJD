import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useEmployee,
  useEmployeeProperty,
} from '../../features/employees/model/use-employee-card.js';
import { useIssuanceList } from '../../features/issuance/documents/model/use-issuance-queries.js';
import { useReturnList } from '../../features/issuance/returns/model/use-return-queries.js';
import { formatTenure } from '../../features/employees/model/format-tenure.js';
import {
  employeeFormSchema,
  employeeFormFields,
} from '../../features/employees/model/employee-form.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { downloadPrintForm } from '../../features/print-forms/api/print-forms-api.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './EmployeeCardPage.module.css';

const { useCatalogMutations } = createCatalogHooks('employees');

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось сохранить';
}

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };
const DOCUMENT_TYPE_LABELS = { issuance: 'Выдача', return: 'Возврат' };
const SIZE_TYPE_LABELS = {
  clothing: 'одежда',
  height: 'рост',
  shoe: 'обувь',
  headwear: 'головной убор',
  belt: 'ремень',
  gloves: 'перчатки',
};

function formatMoney(value) {
  return value == null ? '—' : `${Number(value).toFixed(2)} ₽`;
}

export function EmployeeCardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [printPending, setPrintPending] = useState('');
  const [printError, setPrintError] = useState('');
  const [editing, setEditing] = useState(false);
  const { data: employee, isLoading: isLoadingEmployee } = useEmployee(id);
  const { data: property, isLoading: isLoadingProperty } = useEmployeeProperty(id);
  const { data: issuanceDocuments } = useIssuanceList(id);
  const { data: returnDocuments } = useReturnList(id);
  const { update } = useCatalogMutations();
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('employees.manage'),
  );

  if (isLoadingEmployee || !employee) {
    return <p className={catalogStyles.hint}>Загрузка…</p>;
  }

  async function handleEditSubmit(values) {
    await update.mutateAsync({ id, payload: values });
    setEditing(false);
  }

  const history = [
    ...(issuanceDocuments ?? []).map((document) => ({ ...document, documentType: 'issuance' })),
    ...(returnDocuments ?? []).map((document) => ({ ...document, documentType: 'return' })),
  ].sort((a, b) => new Date(b.documentDate) - new Date(a.documentDate));

  const instances = property?.instances ?? [];
  const importedMeasurements = Object.entries(
    (employee.measurements ?? []).reduce((groups, measurement) => {
      groups[measurement.sizeType] ??= new Set();
      groups[measurement.sizeType].add(measurement.value);
      return groups;
    }, {}),
  )
    .map(([type, values]) => `${SIZE_TYPE_LABELS[type] ?? type}: ${[...values].join(', ')}`)
    .join('; ');

  async function downloadPersonalCard(format) {
    setPrintPending(format);
    setPrintError('');
    try {
      await downloadPrintForm('personal-card', { employeeId: id, format });
    } catch (requestError) {
      setPrintError(
        requestError.response?.data?.message ?? 'Не удалось сформировать личную карточку',
      );
    } finally {
      setPrintPending('');
    }
  }

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
        <div className={catalogStyles.actions}>
          {canManage && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Изменить
            </Button>
          )}
          <Button onClick={() => downloadPersonalCard('xlsx')} disabled={Boolean(printPending)}>
            {printPending === 'xlsx' ? 'Формирование…' : 'Личная карточка Excel'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadPersonalCard('pdf')}
            disabled={Boolean(printPending)}
          >
            {printPending === 'pdf' ? 'Формирование…' : 'Личная карточка PDF'}
          </Button>
        </div>
      </div>
      {printError && <p className={styles.error}>{printError}</p>}

      <div className={styles.summary}>
        <div>
          <span className={styles.label}>Табельный номер</span>
          <span>{employee.personnelNumber ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Дата приёма</span>
          <span>{employee.hireDate ?? '—'}</span>
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
          <span className={styles.label}>Размер головного убора</span>
          <span>{employee.headwearSize?.value ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Размер ремня</span>
          <span>{employee.beltSize?.value ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Размер перчаток</span>
          <span>{employee.glovesSize?.value ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Телефон</span>
          <span>{employee.phone ?? '—'}</span>
        </div>
        <div>
          <span className={styles.label}>Все размеры из актов</span>
          <span>{importedMeasurements || '—'}</span>
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
              <th>Рост</th>
              <th>Стоимость</th>
              <th>Для работника</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingProperty && (
              <tr>
                <td className={catalogStyles.hint} colSpan={6}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoadingProperty && instances.length === 0 && (
              <tr>
                <td className={catalogStyles.hint} colSpan={6}>
                  Сейчас на руках у работника ничего нет
                </td>
              </tr>
            )}
            {instances.map((instance) => (
              <tr key={instance.id}>
                <td>{instance.inventoryNumber}</td>
                <td>{instance.model?.name ?? '—'}</td>
                <td>{instance.size?.value ?? '—'}</td>
                <td>{instance.heightSize?.value ?? '—'}</td>
                <td>{formatMoney(instance.cost)}</td>
                <td>{formatMoney(instance.employeeCost)}</td>
              </tr>
            ))}
          </tbody>
          {instances.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} className={styles.totalLabel}>
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

      {editing && (
        <EntityFormModal
          title="Изменить работника"
          fields={employeeFormFields}
          schema={employeeFormSchema}
          defaultValues={employee}
          onSubmit={handleEditSubmit}
          onClose={() => setEditing(false)}
          isSaving={update.isPending}
          error={errorMessage(update)}
        />
      )}
    </div>
  );
}
