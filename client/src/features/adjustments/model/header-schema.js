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

export const ADJUSTMENT_TYPE_LABELS = {
  surplus: 'Излишек',
  shortage: 'Недостача',
  relocate: 'Найден на другом складе',
  condition: 'Ошибочное состояние',
};

export const CONDITION_LABELS = {
  new: 'Новое',
  good: 'Хорошее',
  worn: 'Изношенное',
  damaged: 'Повреждено',
};
