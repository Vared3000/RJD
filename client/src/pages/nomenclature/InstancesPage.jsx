import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const STATUS_LABELS = {
  in_stock: 'На складе',
  issued: 'Выдан',
  laundry: 'В стирке',
  repair: 'В ремонте',
  write_off: 'Списан',
};

const CONDITION_LABELS = {
  new: 'Новое',
  good: 'Хорошее',
  worn: 'Изношено',
  damaged: 'Повреждено',
};

const SIZE_TYPE_LABELS = { clothing: 'Размер', height: 'Рост', shoe: 'Обувь' };

const emptyToUndefined = (value) => (value === '' ? undefined : value);

const schema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  sizeId: z.string().uuid('Выберите размер'),
  warehouseId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  inventoryNumber: z.string().max(64).optional().or(z.literal('')),
  status: z.enum(['in_stock', 'issued', 'laundry', 'repair', 'write_off']).default('in_stock'),
  condition: z.enum(['new', 'good', 'worn', 'damaged']).default('new'),
  cost: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  employeeCost: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
});

const columns = [
  { key: 'inventoryNumber', label: 'Инв. номер' },
  { key: 'model', label: 'Модель', render: (item) => item.model?.name ?? '—' },
  {
    key: 'size',
    label: 'Размер',
    render: (item) =>
      item.size ? `${SIZE_TYPE_LABELS[item.size.type] ?? item.size.type}: ${item.size.value}` : '—',
  },
  { key: 'status', label: 'Статус', render: (item) => STATUS_LABELS[item.status] ?? item.status },
  {
    key: 'condition',
    label: 'Состояние',
    render: (item) => CONDITION_LABELS[item.condition] ?? item.condition,
  },
  {
    key: 'cost',
    label: 'Стоимость',
    render: (item) => (item.cost != null ? `${item.cost} ₽` : '—'),
  },
];

// batchId не включён в форму: партии создаются документом "Поступление" (Этап 5),
// пока справочника партий с собственным CRUD ещё нет.
const fields = [
  {
    name: 'modelId',
    label: 'Модель',
    type: 'select',
    optionsResource: 'nomenclature-models',
    optionValue: 'id',
    optionLabel: 'name',
  },
  {
    name: 'sizeId',
    label: 'Размер',
    type: 'select',
    optionsResource: 'sizes',
    optionValue: 'id',
    optionLabel: (size) => `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`,
  },
  {
    name: 'warehouseId',
    label: 'Склад',
    type: 'select',
    optionsResource: 'warehouses',
    optionValue: 'id',
    optionLabel: 'name',
  },
  {
    name: 'inventoryNumber',
    label: 'Инвентарный номер',
    type: 'text',
    placeholder: 'Оставьте пустым для автогенерации',
  },
  {
    name: 'status',
    label: 'Статус',
    type: 'select',
    options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
    defaultValue: 'in_stock',
  },
  {
    name: 'condition',
    label: 'Состояние',
    type: 'select',
    options: Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label })),
    defaultValue: 'new',
  },
  { name: 'cost', label: 'Стоимость', type: 'number' },
  { name: 'employeeCost', label: 'Стоимость для работника', type: 'number' },
];

export function InstancesPage() {
  return (
    <CatalogPage
      resource="instances"
      title="Экземпляры"
      columns={columns}
      fields={fields}
      schema={schema}
      viewPermission="nomenclature.view"
      managePermission="nomenclature.manage"
      archiveColumnLabel="Запись"
    />
  );
}
