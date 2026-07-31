import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const schema = z.object({
  positionId: z.string().uuid('Выберите должность'),
  modelId: z.string().uuid('Выберите модель'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля').default(1),
  serviceLifeYears: z.coerce
    .number()
    .int()
    .min(1, 'Минимальный срок — 1 год')
    .max(20, 'Максимальный срок — 20 лет'),
});

const columns = [
  { key: 'position', label: 'Должность', render: (item) => item.position?.name ?? '—' },
  { key: 'model', label: 'Модель', render: (item) => item.model?.name ?? '—' },
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
