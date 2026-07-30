import { z } from 'zod';
import { compareSizes, isPlausibleAtomicSize } from '../../../catalogs/model/size-options.js';

const emptyToUndefined = (value) => (value === '' ? undefined : value);
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());

function selectedModel({ values, relatedItems }) {
  return relatedItems.find((item) => item.id === values.modelId);
}

function modelHint(context) {
  const model = selectedModel(context);
  if (!model) return 'Введите часть названия — например, «бейдж» или «блузка».';
  if (!model.sizeType) return 'Безразмерная позиция — размер и рост не требуются.';
  if (model.requiresHeightSize) return 'Для этой модели укажите размер одежды и рост отдельно.';
  return 'После выбора модели доступны только подходящие размеры.';
}

export const lineSchema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  sizeId: optionalUuid,
  heightSizeId: optionalUuid,
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля'),
  purchasePrice: z.coerce.number().nonnegative('Цена не может быть отрицательной'),
  employeeCost: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  vatRate: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100).optional()),
});

const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

export const lineFields = [
  {
    name: 'modelId',
    label: 'Модель',
    type: 'select',
    optionsResource: 'nomenclature-models',
    optionValue: 'id',
    optionLabel: 'name',
    optionsSort: (left, right) => left.name.localeCompare(right.name, 'ru'),
    searchable: true,
    required: true,
    placeholder: 'Введите название позиции…',
    hint: modelHint,
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
    hint: 'Выберите фактический размер изделия.',
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
    hint: 'Рост хранится отдельно от размера одежды.',
  },
  { name: 'quantity', label: 'Количество', type: 'number', defaultValue: 1, required: true },
  { name: 'purchasePrice', label: 'Закупочная цена', type: 'number', required: true },
  { name: 'employeeCost', label: 'Стоимость для работника', type: 'number' },
  { name: 'vatRate', label: 'НДС, %', type: 'number', defaultValue: 20 },
];
