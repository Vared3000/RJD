import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { EmployeePropertyTable } from '../../features/employees/ui/EmployeePropertyTable.jsx';
import { EmployeeHistoryTable } from '../../features/employees/ui/EmployeeHistoryTable.jsx';
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

const SIZE_TYPE_LABELS = {
  clothing: 'одежда',
  height: 'рост',
  shoe: 'обувь',
  headwear: 'головной убор',
  belt: 'ремень',
  gloves: 'перчатки',
};

export function EmployeeCardPage() {
  const { id } = useParams();
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
      <EmployeePropertyTable instances={instances} totals={property} isLoading={isLoadingProperty} />

      <h2 className={styles.sectionTitle}>История выдач и возвратов</h2>
      <EmployeeHistoryTable history={history} />

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
