import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';
import { GENDER_LABELS } from '../../features/employees/model/employee-form.js';

const SEASON_LABELS = { summer: 'Летний', winter: 'Зимний' };

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

const schema = z.object({
  positionId: z.string().uuid('Выберите должность'),
  modelId: z.string().uuid('Выберите модель'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля').default(1),
  season: z.enum(['summer', 'winter'], { errorMap: () => ({ message: 'Выберите сезон' }) }),
  gender: z.preprocess(emptyToNull, z.enum(['male', 'female']).nullable().optional()),
  serviceLifeYears: z.coerce
    .number()
    .int()
    .min(1, 'Минимальный срок — 1 год')
    .max(20, 'Максимальный срок — 20 лет'),
});

const columns = [
  { key: 'position', label: 'Должность', render: (item) => item.position?.name ?? '—' },
  { key: 'model', label: 'Модель', render: (item) => item.model?.name ?? '—' },
  {
    key: 'season',
    label: 'Сезон',
    render: (item) => (item.season ? (SEASON_LABELS[item.season] ?? item.season) : '—'),
  },
  { key: 'gender', label: 'Пол', render: (item) => GENDER_LABELS[item.gender] ?? 'Унисекс' },
  { key: 'quantity', label: 'Количество' },
  { key: 'serviceLifeYears', label: 'Срок, лет', render: (item) => item.serviceLifeYears ?? '—' },
];

const fields = [
  {
    name: 'positionId',
    label: 'Должность',
    type: 'select',
    optionsResource: 'positions',
    optionValue: 'id',
    optionLabel: 'name',
  },
  {
    name: 'modelId',
    label: 'Модель',
    type: 'select',
    optionsResource: 'nomenclature-models',
    optionValue: 'id',
    optionLabel: 'name',
  },
  { name: 'quantity', label: 'Количество', type: 'number', defaultValue: 1 },
  {
    name: 'season',
    label: 'Сезон',
    type: 'select',
    options: [
      { value: 'summer', label: 'Летний' },
      { value: 'winter', label: 'Зимний' },
    ],
  },
  {
    name: 'gender',
    label: 'Пол (пусто — унисекс)',
    type: 'select',
    options: Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    name: 'serviceLifeYears',
    label: 'Срок использования, лет',
    type: 'number',
    defaultValue: 2,
  },
];

export function KitsPage() {
  return (
    <CatalogPage
      resource="kits"
      title="Комплекты по должности"
      columns={columns}
      fields={fields}
      schema={schema}
      viewPermission="employees.view"
      managePermission="employees.manage"
    />
  );
}
