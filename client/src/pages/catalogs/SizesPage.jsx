import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const SIZE_TYPE_LABELS = {
  clothing: 'Размер одежды',
  height: 'Рост',
  shoe: 'Обувь',
};

const schema = z.object({
  type: z.enum(['clothing', 'height', 'shoe'], { message: 'Выберите тип' }),
  value: z.string().min(1, 'Укажите значение').max(32),
  sortOrder: z.coerce.number().int().default(0),
});

const columns = [
  { key: 'type', label: 'Тип', render: (item) => SIZE_TYPE_LABELS[item.type] ?? item.type },
  { key: 'value', label: 'Значение' },
  { key: 'sortOrder', label: 'Порядок' },
];

const fields = [
  {
    name: 'type',
    label: 'Тип',
    type: 'select',
    options: Object.entries(SIZE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  },
  { name: 'value', label: 'Значение', type: 'text' },
  { name: 'sortOrder', label: 'Порядок сортировки', type: 'number', defaultValue: 0 },
];

export function SizesPage() {
  return (
    <CatalogPage
      resource="sizes"
      title="Размеры"
      columns={columns}
      fields={fields}
      schema={schema}
    />
  );
}
