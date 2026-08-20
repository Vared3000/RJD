import { Link } from 'react-router-dom';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
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

// Три статуса печатной формы «Список работников» (Релиз В,
// docs/TZ_NEXT_RELEASES_2026-08-19.md) — вычисляются на бэкенде
// (employees/employee-status.js), здесь только подписи для select-фильтра.
const STATUS_OPTIONS = [
  { value: 'active', label: 'Активен' },
  { value: 'terminated', label: 'Уволен' },
  { value: 'archived', label: 'В архиве' },
];

const STATUS_BADGE_CLASS = {
  active: catalogStyles.active,
  terminated: catalogStyles.terminated,
  archived: catalogStyles.archived,
};

// Узкий renderer для встроенной колонки статуса CatalogPage
// (CLAUDE_REVIEW_TASK.md пункт 2) — item.status/item.statusCode приходят
// уже посчитанными с бэкенда (employees.repository.js#list, тот же
// приоритет В архиве -> Уволен -> Активен, что и у печатной формы), поэтому
// здесь нет собственной бизнес-логики вычисления статуса — только выбор
// CSS-класса значка по уже готовому коду статуса.
function renderEmployeeStatus(item) {
  const badgeClass = STATUS_BADGE_CLASS[item.statusCode] ?? catalogStyles.active;
  return <span className={badgeClass}>{item.status ?? '—'}</span>;
}

const SORT_OPTIONS = [
  { value: 'fullName', label: 'ФИО' },
  { value: 'personnelNumber', label: 'Табельный номер' },
  { value: 'region', label: 'Регион' },
  { value: 'position', label: 'Должность' },
  { value: 'dpo', label: 'ДПО' },
  { value: 'status', label: 'Статус' },
];

export function EmployeesPage() {
  const { data: dpos } = createCatalogHooks('dpo').useList(false);
  const dpoFilter = {
    name: 'dpoId',
    label: 'ДПО',
    options: (dpos ?? []).map((dpo) => ({ value: dpo.id, label: dpo.name })),
  };
  const regions = [...new Set((dpos ?? []).map((dpo) => dpo.region).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );
  const regionFilter = {
    name: 'region',
    label: 'Регион',
    options: regions.map((region) => ({ value: region, label: region })),
  };
  const statusFilter = { name: 'status', label: 'Статус', options: STATUS_OPTIONS };

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
      filters={[dpoFilter, regionFilter, statusFilter]}
      sortOptions={SORT_OPTIONS}
      exportReport="employees-list"
      archiveColumnRender={renderEmployeeStatus}
    />
  );
}
