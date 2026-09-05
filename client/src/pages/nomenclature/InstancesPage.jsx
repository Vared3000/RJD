import { z } from 'zod';
import { Link } from 'react-router-dom';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';
import { compareSizes, isPlausibleAtomicSize } from '../../features/catalogs/model/size-options.js';
import { LAUNDRY_REPAIR_ENABLED } from '../../shared/config/features.js';

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

const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

const emptyToUndefined = (value) => (value === '' ? undefined : value);
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());

function selectedModel({ values, relatedItems }) {
  return relatedItems.find((item) => item.id === values.modelId);
}

const schema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  sizeId: optionalUuid,
  heightSizeId: optionalUuid,
  warehouseId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  inventoryNumber: z.string().max(64).optional().or(z.literal('')),
  status: z.enum(['in_stock', 'issued', 'laundry', 'repair', 'write_off']).default('in_stock'),
  condition: z.enum(['new', 'good', 'worn', 'damaged']).default('new'),
});

const columns = [
  {
    key: 'inventoryNumber',
    label: 'Инв. номер',
    render: (item) => <Link to={`/nomenclature/instances/${item.id}`}>{item.inventoryNumber}</Link>,
  },
  { key: 'model', label: 'Модель', render: (item) => item.model?.name ?? '—' },
  {
    key: 'size',
    label: 'Размер',
    render: (item) =>
      item.size ? `${SIZE_TYPE_LABELS[item.size.type] ?? item.size.type}: ${item.size.value}` : '—',
  },
  {
    key: 'heightSize',
    label: 'Рост',
    render: (item) => item.heightSize?.value ?? '—',
  },
  { key: 'status', label: 'Статус', render: (item) => STATUS_LABELS[item.status] ?? item.status },
  {
    key: 'condition',
    label: 'Состояние',
    render: (item) => CONDITION_LABELS[item.condition] ?? item.condition,
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
    optionsSort: (left, right) => left.name.localeCompare(right.name, 'ru'),
    searchable: true,
    serverSearch: true,
    required: true,
    placeholder: 'Введите название позиции…',
    hint: (context) => {
      const model = selectedModel(context);
      if (!model) return 'Введите часть названия модели.';
      return model.sizeType
        ? 'Ниже показаны только размеры, подходящие этой модели.'
        : 'Безразмерная позиция — размер и рост не требуются.';
    },
  },
  {
    name: 'sizeId',
    label: 'Размер',
    type: 'select',
    optionsResource: 'sizes',
    optionsFilterResource: 'nomenclature-models',
    optionsFilter: (size, { values, relatedItems }) => {
      const model = relatedItems.find((item) => item.id === values.modelId);
      return (
        isPlausibleAtomicSize(size) &&
        size.type !== 'height' &&
        Boolean(model?.sizeType) &&
        size.type === model.sizeType
      );
    },
    hiddenWhen: (context) => !selectedModel(context)?.sizeType,
    optionsSort: compareSizes,
    optionValue: 'id',
    optionLabel: (size) => `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`,
    required: true,
  },
  {
    name: 'heightSizeId',
    label: 'Рост (для составного размера одежды)',
    type: 'select',
    optionsResource: 'sizes',
    optionsFilterResource: 'nomenclature-models',
    optionsFilter: (size, { values, relatedItems }) => {
      const model = relatedItems.find((item) => item.id === values.modelId);
      return (
        size.type === 'height' && isPlausibleAtomicSize(size) && Boolean(model?.requiresHeightSize)
      );
    },
    hiddenWhen: (context) => !selectedModel(context)?.requiresHeightSize,
    optionsSort: compareSizes,
    optionValue: 'id',
    optionLabel: 'value',
    required: true,
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
    options: Object.entries(STATUS_LABELS)
      .filter(([value]) => LAUNDRY_REPAIR_ENABLED || !['laundry', 'repair'].includes(value))
      .map(([value, label]) => ({ value, label })),
    defaultValue: 'in_stock',
  },
  {
    name: 'condition',
    label: 'Состояние',
    type: 'select',
    options: Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label })),
    defaultValue: 'new',
  },
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
