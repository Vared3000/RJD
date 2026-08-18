import { z } from 'zod';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const optionalUuid = z.preprocess(
  emptyToNull,
  z.string().uuid('Некорректный идентификатор').nullable(),
);

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
  sizeId: optionalUuid.optional(),
  heightSizeId: optionalUuid.optional(),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля'),
});

export const updateLineSchema = createLineSchema.partial();

// Задача 22: полная замена шапки и строк уже проведённого документа одной
// командой — header по той же схеме, что создание, lines не может быть
// пустым (документ без позиций нечего проводить).
export const reviseDocumentSchema = z.object({
  header: createDocumentSchema,
  lines: z.array(createLineSchema).min(1, 'В документе должна быть хотя бы одна позиция'),
  reason: z.string().max(500).optional().nullable().or(z.literal('')),
});
