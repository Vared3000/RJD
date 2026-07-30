import { z } from 'zod';

const emptyToUndefined = (value) => (value === '' ? undefined : value);

export const lineSchema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  sizeId: z.string().uuid('Выберите размер'),
  heightSizeId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля'),
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
    optionValue: 'id',
    optionLabel: (size) => `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`,
  },
  {
    name: 'heightSizeId',
    label: 'Рост (для составного размера одежды)',
    type: 'select',
    optionsResource: 'sizes',
    optionsFilter: (size) => size.type === 'height',
    optionValue: 'id',
    optionLabel: 'value',
  },
  { name: 'quantity', label: 'Количество', type: 'number', defaultValue: 1 },
];
