import { z } from 'zod';

export const headerSchema = z.object({
  employeeId: z.string().uuid('Выберите работника'),
  warehouseId: z.string().uuid('Выберите склад'),
  documentDate: z.string().min(1, 'Укажите дату'),
  note: z.string().max(1000).optional().or(z.literal('')),
});

export const headerFields = [
  {
    name: 'employeeId',
    label: 'Работник',
    type: 'select',
    searchable: true,
    serverSearch: true,
    optionsResource: 'employees',
    optionValue: 'id',
    optionLabel: 'fullName',
  },
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
