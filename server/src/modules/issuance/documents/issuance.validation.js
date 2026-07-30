import { z } from 'zod';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

export const createDocumentSchema = z.object({
  employeeId: z.string().uuid('Выберите работника'),
  warehouseId: z.string().uuid('Выберите склад'),
  documentDate: z.string().min(1, 'Укажите дату'),
  note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
});

export const updateDocumentSchema = createDocumentSchema.partial();

export const createLineSchema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  sizeId: z.string().uuid('Выберите размер'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля'),
});

export const updateLineSchema = createLineSchema.partial();
