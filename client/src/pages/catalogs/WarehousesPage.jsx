import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const schema = z.object({
  organizationId: z.string().uuid('Выберите организацию'),
  name: z.string().min(1, 'Укажите название').max(255),
  code: z.string().max(64).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
});

const columns = [
  { key: 'name', label: 'Название' },
  { key: 'code', label: 'Код' },
  { key: 'organization', label: 'Организация', render: (item) => item.organization?.name ?? '—' },
  { key: 'address', label: 'Адрес' },
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
