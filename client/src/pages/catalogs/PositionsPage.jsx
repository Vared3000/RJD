import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const schema = z.object({
  name: z.string().min(1, 'Укажите название').max(255),
  code: z.string().max(64).optional().or(z.literal('')),
});

const columns = [
  { key: 'name', label: 'Название' },
  { key: 'code', label: 'Код' },
];

const fields = [
  { name: 'name', label: 'Название', type: 'text' },
  { name: 'code', label: 'Код', type: 'text' },
];

export function PositionsPage() {
  return (
    <CatalogPage
      resource="positions"
      title="Должности"
      columns={columns}
      fields={fields}
      schema={schema}
    />
  );
}
