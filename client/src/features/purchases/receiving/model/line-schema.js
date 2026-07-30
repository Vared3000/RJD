import { z } from 'zod';
import {
  compareSizes,
  isPlausibleAtomicSize,
} from '../../../catalogs/model/size-options.js';

const emptyToUndefined = (value) => (value === '' ? undefined : value);

export const lineSchema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  sizeId: z.string().uuid('Выберите размер'),
  heightSizeId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
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
        (!model?.sizeType || size.type === model.sizeType)
      );
    },
    optionsSort: compareSizes,
    optionValue: 'id',
    optionLabel: (size) => `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`,
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
        size.type === 'height' &&
        isPlausibleAtomicSize(size) &&
        Boolean(model?.requiresHeightSize)
      );
    },
    optionsSort: compareSizes,
    optionValue: 'id',
    optionLabel: 'value',
  },
  { name: 'quantity', label: 'Количество', type: 'number', defaultValue: 1 },
  { name: 'purchasePrice', label: 'Закупочная цена', type: 'number' },
  { name: 'employeeCost', label: 'Стоимость для работника', type: 'number' },
  { name: 'vatRate', label: 'НДС, %', type: 'number', defaultValue: 20 },
];
