import { Link } from 'react-router-dom';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';
import { formatTenure } from '../../features/employees/model/format-tenure.js';
import {
  employeeFormSchema,
  employeeFormFields,
  GENDER_LABELS,
} from '../../features/employees/model/employee-form.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';

const columns = [
  {
    key: 'fullName',
    label: 'ФИО',
    render: (item) => (
      <Link to={`/employees/${item.id}`} className={catalogStyles.linkButton}>
        {item.fullName}
      </Link>
    ),
  },
  { key: 'gender', label: 'Пол', render: (item) => GENDER_LABELS[item.gender] ?? '—' },
  { key: 'organization', label: 'Организация', render: (item) => item.organization?.name ?? '—' },
  { key: 'subdivision', label: 'Подразделение', render: (item) => item.subdivision?.name ?? '—' },
  { key: 'position', label: 'Должность', render: (item) => item.position?.name ?? '—' },
  { key: 'dpo', label: 'ДПО', render: (item) => item.dpo?.name ?? '—' },
  { key: 'hireDate', label: 'Дата приёма', render: (item) => item.hireDate ?? '—' },
  {
    key: 'tenure',
    label: 'Стаж',
    render: (item) => formatTenure(item.hireDate, item.terminationDate),
  },
  {
    key: 'terminationDate',
    label: 'Дата увольнения',
    render: (item) => item.terminationDate ?? '—',
  },
];

export function EmployeesPage() {
  return (
    <CatalogPage
      resource="employees"
      title="Работники"
      description="Карточки работников, должности, подразделения и закреплённые ДПО."
      columns={columns}
      fields={employeeFormFields}
      schema={employeeFormSchema}
      viewPermission="employees.view"
      managePermission="employees.manage"
      searchable
    />
  );
}
