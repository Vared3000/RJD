import { z } from 'zod';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

export const createDocumentSchema = z
  .object({
    fromWarehouseId: z.string().uuid('Выберите склад-отправитель'),
    toWarehouseId: z.string().uuid('Выберите склад-получатель'),
    documentDate: z.string().min(1, 'Укажите дату'),
    note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
  })
  .refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    message: 'Склад-отправитель и склад-получатель не должны совпадать',
    path: ['toWarehouseId'],
  });

export const updateDocumentSchema = z.object({
  fromWarehouseId: z.string().uuid().optional(),
  toWarehouseId: z.string().uuid().optional(),
  documentDate: z.string().min(1).optional(),
  note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
});

export const createLineSchema = z.object({
  instanceId: z.string().uuid('Выберите экземпляр'),
  note: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
});

export const updateLineSchema = createLineSchema.partial();
