import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const SIZE_TYPE_LABELS = {
  clothing: 'Одежда',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

const emptyToUndefined = (value) => (value === '' ? undefined : value);

const schema = z
  .object({
    name: z.string().min(1, 'Укажите название').max(255),
    article: z.string().max(64).optional().or(z.literal('')),
    unit: z.string().min(1).max(16).default('шт'),
    sizeType: z.preprocess(
      emptyToUndefined,
      z.enum(['clothing', 'height', 'shoe', 'headwear', 'belt', 'gloves']).optional(),
    ),
    requiresHeightSize: z.boolean().default(false),
    description: z.string().max(1000).optional().or(z.literal('')),
  })
  .refine((data) => !data.requiresHeightSize || data.sizeType === 'clothing', {
    path: ['requiresHeightSize'],
    message: 'Рост можно требовать только для типа «Одежда»',
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
  {
    key: 'requiresHeightSize',
    label: 'Нужен рост',
    render: (item) => (item.requiresHeightSize ? 'Да' : 'Нет'),
  },
  {
    key: 'latestPrice',
    label: 'Последняя цена без НДС',
    render: (item) => {
      const price = item.prices?.[0];
      if (!price) return '—';
      const dpo = price.dpo?.name ? ` · ${price.dpo.name}` : '';
      return `${Number(price.priceWithoutVat).toFixed(4)} ₽${dpo}`;
    },
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
  {
    name: 'requiresHeightSize',
    label: 'Требует указания роста (только для типа «Одежда»)',
    type: 'checkbox',
    defaultValue: false,
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
