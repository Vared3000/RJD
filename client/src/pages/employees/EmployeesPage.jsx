import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';
import { formatTenure } from '../../features/employees/model/format-tenure.js';

const emptyToUndefined = (value) => (value === '' ? undefined : value);
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const optionalDate = z.preprocess(emptyToUndefined, z.string().date().optional());
const optionalString = (max) => z.preprocess(emptyToUndefined, z.string().max(max).optional());

const schema = z.object({
  organizationId: z.string().uuid('Выберите организацию'),
  subdivisionId: optionalUuid,
  positionId: optionalUuid,
  fullName: z.string().min(1, 'Укажите ФИО').max(255),
  personnelNumber: optionalString(64),
  birthDate: optionalDate,
  hireDate: z.string().date('Укажите дату приёма'),
  terminationDate: optionalDate,
  clothingSizeId: optionalUuid,
  heightSizeId: optionalUuid,
  shoeSizeId: optionalUuid,
  phone: optionalString(32),
});

const columns = [
  { key: 'fullName', label: 'ФИО' },
  { key: 'organization', label: 'Организация', render: (item) => item.organization?.name ?? '—' },
  { key: 'subdivision', label: 'Подразделение', render: (item) => item.subdivision?.name ?? '—' },
  { key: 'position', label: 'Должность', render: (item) => item.position?.name ?? '—' },
  { key: 'hireDate', label: 'Дата приёма' },
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

const fields = [
  {
    name: 'organizationId',
    label: 'Организация',
    type: 'select',
    optionsResource: 'organizations',
    optionValue: 'id',
    optionLabel: 'name',
  },
  {
    name: 'subdivisionId',
    label: 'Подразделение',
    type: 'select',
    optionsResource: 'subdivisions',
    optionValue: 'id',
    optionLabel: 'name',
  },
  {
    name: 'positionId',
    label: 'Должность',
    type: 'select',
    optionsResource: 'positions',
    optionValue: 'id',
    optionLabel: 'name',
  },
  { name: 'fullName', label: 'ФИО', type: 'text' },
  { name: 'personnelNumber', label: 'Табельный номер', type: 'text' },
  { name: 'birthDate', label: 'Дата рождения', type: 'date' },
  { name: 'hireDate', label: 'Дата приёма', type: 'date' },
  { name: 'terminationDate', label: 'Дата увольнения', type: 'date' },
  {
    name: 'clothingSizeId',
    label: 'Размер одежды',
    type: 'select',
    optionsResource: 'sizes',
    optionsFilter: (size) => size.type === 'clothing',
    optionValue: 'id',
    optionLabel: 'value',
  },
  {
    name: 'heightSizeId',
    label: 'Рост',
    type: 'select',
    optionsResource: 'sizes',
    optionsFilter: (size) => size.type === 'height',
    optionValue: 'id',
    optionLabel: 'value',
  },
  {
    name: 'shoeSizeId',
    label: 'Размер обуви',
    type: 'select',
    optionsResource: 'sizes',
    optionsFilter: (size) => size.type === 'shoe',
    optionValue: 'id',
    optionLabel: 'value',
  },
  { name: 'phone', label: 'Телефон', type: 'text' },
];

export function EmployeesPage() {
  return (
    <CatalogPage
      resource="employees"
      title="Работники"
      columns={columns}
      fields={fields}
      schema={schema}
      viewPermission="employees.view"
      managePermission="employees.manage"
    />
  );
}
