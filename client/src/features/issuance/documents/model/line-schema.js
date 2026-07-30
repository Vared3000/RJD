import { z } from 'zod';

export const lineSchema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  sizeId: z.string().uuid('Выберите размер'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля'),
});

const SIZE_TYPE_LABELS = { clothing: 'Размер', height: 'Рост', shoe: 'Обувь' };

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
  { name: 'quantity', label: 'Количество', type: 'number', defaultValue: 1 },
];
