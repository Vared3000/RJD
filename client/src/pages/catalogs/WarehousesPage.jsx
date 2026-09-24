import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const schema = z.object({
  organizationId: z.string().uuid('Выберите организацию'),
  name: z.string().min(1, 'Укажите название').max(255),
  code: z.string().max(64).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  isPrimaryForReturns: z.boolean().default(false),
});

const columns = [
  { key: 'name', label: 'Название' },
  { key: 'code', label: 'Код' },
  { key: 'organization', label: 'Организация', render: (item) => item.organization?.name ?? '—' },
  { key: 'address', label: 'Адрес' },
  {
    key: 'isPrimaryForReturns',
    label: 'Новые возвраты',
    render: (item) => (item.isPrimaryForReturns ? 'Основной' : '—'),
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
  { name: 'name', label: 'Название', type: 'text' },
  { name: 'code', label: 'Код', type: 'text' },
  { name: 'address', label: 'Адрес', type: 'text' },
  {
    name: 'isPrimaryForReturns',
    label: 'Основной склад для возврата новых вещей',
    type: 'checkbox',
    defaultValue: false,
    hint: 'Один действующий склад на организацию. Новые вещи автоматически возвращаются сюда независимо от названия склада.',
  },
];

export function WarehousesPage() {
  return (
    <CatalogPage
      resource="warehouses"
      title="Склады"
      columns={columns}
      fields={fields}
      schema={schema}
    />
  );
}
