import { z } from 'zod';
import { compareSizes, isPlausibleAtomicSize } from '../../catalogs/model/size-options.js';
import { ADJUSTMENT_TYPE_LABELS, CONDITION_LABELS } from './header-schema.js';

const emptyToUndefined = (value) => (value === '' ? undefined : value);
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const reason = z.string().min(1, 'Укажите основание').max(500);
const optionalNote = z.string().max(500).optional().or(z.literal(''));

const surplusLineSchema = z.object({
  adjustmentType: z.literal('surplus'),
  modelId: z.string().uuid('Выберите модель'),
  sizeId: optionalUuid,
  heightSizeId: optionalUuid,
  toWarehouseId: z.string().uuid('Выберите склад'),
  toCondition: z.preprocess(
    emptyToUndefined,
    z.enum(['new', 'good', 'worn', 'damaged']).optional(),
  ),
  reason,
  note: optionalNote,
});

const shortageLineSchema = z.object({
  adjustmentType: z.literal('shortage'),
  instanceId: z.string().uuid('Выберите экземпляр'),
  reason,
  note: optionalNote,
});

const relocateLineSchema = z.object({
  adjustmentType: z.literal('relocate'),
  instanceId: z.string().uuid('Выберите экземпляр'),
  toWarehouseId: z.string().uuid('Выберите склад'),
  reason,
  note: optionalNote,
});

const conditionLineSchema = z.object({
  adjustmentType: z.literal('condition'),
  instanceId: z.string().uuid('Выберите экземпляр'),
  toCondition: z.enum(['new', 'good', 'worn', 'damaged'], {
    errorMap: () => ({ message: 'Укажите состояние' }),
  }),
  reason,
  note: optionalNote,
});

export const lineSchema = z.discriminatedUnion('adjustmentType', [
  surplusLineSchema,
  shortageLineSchema,
  relocateLineSchema,
  conditionLineSchema,
]);

function type(context) {
  return context.values.adjustmentType;
}

function selectedModel({ values, relatedItems }) {
  return relatedItems.find((item) => item.id === values.modelId);
}

export const lineFields = [
  {
    name: 'adjustmentType',
    label: 'Тип корректировки',
    type: 'select',
    required: true,
    defaultValue: 'shortage',
    options: Object.entries(ADJUSTMENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    name: 'instanceId',
    label: 'Экземпляр',
    type: 'select',
    optionsResource: 'instances',
    optionsFilter: (instance) => instance.status === 'in_stock',
    optionsSort: (left, right) => left.inventoryNumber.localeCompare(right.inventoryNumber, 'ru'),
    optionValue: 'id',
    optionLabel: (instance) => `${instance.inventoryNumber} — ${instance.model?.name ?? ''}`,
    searchable: true,
    hiddenWhen: (context) => type(context) === 'surplus',
    required: true,
    hint: 'В наличии на любом складе — не только на складе документа.',
  },
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
    hiddenWhen: (context) => type(context) !== 'surplus',
    required: true,
    placeholder: 'Введите название позиции…',
  },
  {
    name: 'sizeId',
    label: 'Размер',
    type: 'select',
    optionsResource: 'sizes',
    optionsFilterResource: 'nomenclature-models',
    optionsFilter: (size, context) => {
      const model = selectedModel(context);
      return (
        isPlausibleAtomicSize(size) &&
        size.type !== 'height' &&
        Boolean(model?.sizeType) &&
        size.type === model.sizeType
      );
    },
    hiddenWhen: (context) => type(context) !== 'surplus' || !selectedModel(context)?.sizeType,
    optionsSort: compareSizes,
    optionValue: 'id',
    optionLabel: (size) => `${size.type}: ${size.value}`,
    required: true,
  },
  {
    name: 'heightSizeId',
    label: 'Рост (для составного размера)',
    type: 'select',
    optionsResource: 'sizes',
    optionsFilterResource: 'nomenclature-models',
    optionsFilter: (size, context) => {
      const model = selectedModel(context);
      return (
        size.type === 'height' && isPlausibleAtomicSize(size) && Boolean(model?.requiresHeightSize)
      );
    },
    hiddenWhen: (context) =>
      type(context) !== 'surplus' || !selectedModel(context)?.requiresHeightSize,
    optionsSort: compareSizes,
    optionValue: 'id',
    optionLabel: 'value',
    required: true,
  },
  {
    name: 'toWarehouseId',
    label: 'Склад',
    type: 'select',
    optionsResource: 'warehouses',
    optionValue: 'id',
    optionLabel: 'name',
    hiddenWhen: (context) => !['surplus', 'relocate'].includes(type(context)),
    required: true,
    hint: (context) =>
      type(context) === 'surplus' ? 'Куда оприходовать найденный экземпляр.' : 'Фактический склад.',
  },
  {
    name: 'toCondition',
    label: 'Состояние',
    type: 'select',
    options: Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label })),
    defaultValue: 'good',
    hiddenWhen: (context) => !['surplus', 'condition'].includes(type(context)),
    required: true,
  },
  { name: 'reason', label: 'Основание', type: 'text', required: true },
  { name: 'note', label: 'Примечание', type: 'text' },
];
