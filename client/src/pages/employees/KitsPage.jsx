import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const schema = z.object({
  positionId: z.string().uuid('Выберите должность'),
  modelId: z.string().uuid('Выберите модель'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля').default(1),
});

const columns = [
  { key: 'position', label: 'Должность', render: (item) => item.position?.name ?? '—' },
  { key: 'model', label: 'Модель', render: (item) => item.model?.name ?? '—' },
  { key: 'quantity', label: 'Количество' },
];

// В выборе модели — только модели с указанным типом размера: без него
// автоподбор комплекта в документе "Выдача" не сможет определить, какой из
// трёх размеров работника подставить (см. issuance.service.js: applyKit).
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
    optionsFilter: (model) => Boolean(model.sizeType),
    optionValue: 'id',
    optionLabel: 'name',
  },
  { name: 'quantity', label: 'Количество', type: 'number', defaultValue: 1 },
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
