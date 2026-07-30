import { z } from 'zod';

export const headerSchema = z
  .object({
    fromWarehouseId: z.string().uuid('Выберите склад-отправитель'),
    toWarehouseId: z.string().uuid('Выберите склад-получатель'),
    documentDate: z.string().min(1, 'Укажите дату'),
    note: z.string().max(1000).optional().or(z.literal('')),
  })
  .refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    message: 'Склад-отправитель и склад-получатель не должны совпадать',
    path: ['toWarehouseId'],
  });

export const headerFields = [
  {
    name: 'fromWarehouseId',
    label: 'Склад-отправитель',
    type: 'select',
    optionsResource: 'warehouses',
    optionValue: 'id',
    optionLabel: 'name',
  },
  {
    name: 'toWarehouseId',
    label: 'Склад-получатель',
    type: 'select',
    optionsResource: 'warehouses',
    optionValue: 'id',
    optionLabel: 'name',
  },
  { name: 'documentDate', label: 'Дата документа', type: 'date' },
  { name: 'note', label: 'Примечание', type: 'text' },
];
