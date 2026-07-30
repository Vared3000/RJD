import { z } from 'zod';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

export const createDocumentSchema = z.object({
  warehouseId: z.string().uuid('Выберите склад'),
  documentDate: z.string().min(1, 'Укажите дату'),
  note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
});

export const updateDocumentSchema = createDocumentSchema.partial();

export const createLineSchema = z.object({
  instanceId: z.string().uuid('Выберите экземпляр'),
  reason: z.string().min(1, 'Укажите причину списания').max(500),
  note: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
});

export const updateLineSchema = createLineSchema.partial();
