import { z } from 'zod';

export const headerSchema = z.object({
  warehouseId: z.string().uuid('Выберите склад'),
  documentDate: z.string().min(1, 'Укажите дату'),
  note: z.string().max(1000).optional().or(z.literal('')),
});

export const headerFields = [
  {
    name: 'warehouseId',
    label: 'Склад',
    type: 'select',
    optionsResource: 'warehouses',
    optionValue: 'id',
    optionLabel: 'name',
  },
  { name: 'documentDate', label: 'Дата документа', type: 'date' },
  { name: 'note', label: 'Примечание', type: 'text' },
];

// Склад после создания не редактируется — строки уже сформированы снимком
// остатков именно этого склада (см. inventory.service.js на бэкенде).
export const updateHeaderSchema = z.object({
  documentDate: z.string().min(1, 'Укажите дату'),
  note: z.string().max(1000).optional().or(z.literal('')),
});

export const updateHeaderFields = [
  { name: 'documentDate', label: 'Дата документа', type: 'date' },
  { name: 'note', label: 'Примечание', type: 'text' },
];
