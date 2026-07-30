import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const SIZE_TYPE_LABELS = { clothing: 'Одежда', height: 'Рост', shoe: 'Обувь' };

const emptyToUndefined = (value) => (value === '' ? undefined : value);

const schema = z.object({
  name: z.string().min(1, 'Укажите название').max(255),
  article: z.string().max(64).optional().or(z.literal('')),
  unit: z.string().min(1).max(16).default('шт'),
  sizeType: z.preprocess(emptyToUndefined, z.enum(['clothing', 'height', 'shoe']).optional()),
  description: z.string().max(1000).optional().or(z.literal('')),
});

const columns = [
  { key: 'name', label: 'Название' },
  { key: 'article', label: 'Артикул' },
  { key: 'unit', label: 'Ед. изм.' },
  {
    key: 'sizeType',
    label: 'Тип размера',
    render: (item) => SIZE_TYPE_LABELS[item.sizeType] ?? '—',
  },
];

const fields = [
  { name: 'name', label: 'Название', type: 'text' },
  { name: 'article', label: 'Артикул', type: 'text' },
  { name: 'unit', label: 'Единица измерения', type: 'text', defaultValue: 'шт' },
  {
    name: 'sizeType',
    label: 'Тип размера',
    type: 'select',
    options: Object.entries(SIZE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  },
  { name: 'description', label: 'Описание', type: 'text' },
];

export function NomenclatureModelsPage() {
  return (
    <CatalogPage
      resource="nomenclature-models"
      title="Модели номенклатуры"
      columns={columns}
      fields={fields}
      schema={schema}
      viewPermission="nomenclature.view"
      managePermission="nomenclature.manage"
    />
  );
}
