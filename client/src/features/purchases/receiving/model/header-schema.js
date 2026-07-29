import { z } from 'zod';

export const headerSchema = z.object({
  supplierId: z.string().uuid('Выберите поставщика'),
  warehouseId: z.string().uuid('Выберите склад'),
  documentDate: z.string().min(1, 'Укажите дату'),
  contractNumber: z.string().max(128).optional().or(z.literal('')),
  invoiceNumber: z.string().max(64).optional().or(z.literal('')),
  note: z.string().max(1000).optional().or(z.literal('')),
});

export const headerFields = [
  {
    name: 'supplierId',
    label: 'Поставщик',
    type: 'select',
    optionsResource: 'suppliers',
    optionValue: 'id',
    optionLabel: 'name',
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
  { name: 'contractNumber', label: 'Договор', type: 'text' },
  { name: 'invoiceNumber', label: 'Номер накладной', type: 'text' },
  { name: 'note', label: 'Примечание', type: 'text' },
];
