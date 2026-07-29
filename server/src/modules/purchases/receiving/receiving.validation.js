import { z } from 'zod';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const optionalNumber = (schema) => z.preprocess(emptyToNull, schema.nullable());

export const createDocumentSchema = z.object({
  supplierId: z.string().uuid('Выберите поставщика'),
  warehouseId: z.string().uuid('Выберите склад'),
  contractNumber: z.string().max(128).optional().nullable().or(z.literal('')),
  invoiceNumber: z.string().max(64).optional().nullable().or(z.literal('')),
  documentDate: z.string().min(1, 'Укажите дату'),
  note: z.string().max(1000).optional().nullable().or(z.literal('')),
});

export const updateDocumentSchema = createDocumentSchema.partial();

export const createLineSchema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  sizeId: z.string().uuid('Выберите размер'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля'),
  purchasePrice: z.coerce.number().nonnegative('Цена не может быть отрицательной'),
  employeeCost: optionalNumber(z.coerce.number().nonnegative()).optional(),
  vatRate: optionalNumber(z.coerce.number().min(0).max(100)).optional(),
});

export const updateLineSchema = createLineSchema.partial();
