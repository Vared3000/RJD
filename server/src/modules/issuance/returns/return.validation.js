import { z } from 'zod';
import { INSTANCE_CONDITIONS } from '../../../database/models/instance.model.js';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

export const createDocumentSchema = z.object({
  employeeId: z.string().uuid('Выберите работника'),
  warehouseId: z.string().uuid('Выберите склад'),
  documentDate: z.string().min(1, 'Укажите дату'),
  note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
});

export const updateDocumentSchema = createDocumentSchema.partial();

export const createLineSchema = z.object({
  targetWarehouseId: z
    .preprocess(emptyToNull, z.string().uuid('Выберите склад позиции').nullable())
    .optional(),
  instanceId: z.string().uuid('Выберите экземпляр'),
  condition: z.enum(INSTANCE_CONDITIONS).default('good'),
  // Этап 9: куда направить экземпляр вместо склада — сразу в Стирку/Ремонт.
  routeTo: z.enum(['in_stock', 'laundry', 'repair']).default('in_stock'),
  note: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
});

export const createLinesBulkSchema = z
  .object({
    targetWarehouseId: z
      .preprocess(emptyToNull, z.string().uuid('Выберите склад позиции').nullable())
      .optional(),
    instanceIds: z
      .array(z.string().uuid('Выберите корректные экземпляры'))
      .min(1, 'Выберите хотя бы одну вещь')
      .max(500, 'За один раз можно добавить не более 500 вещей'),
    condition: z.enum(INSTANCE_CONDITIONS).default('good'),
    routeTo: z.enum(['in_stock', 'laundry', 'repair']).default('in_stock'),
    note: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
  })
  .superRefine(({ instanceIds }, context) => {
    if (new Set(instanceIds).size !== instanceIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['instanceIds'],
        message: 'Одна и та же вещь выбрана несколько раз',
      });
    }
  });

export const updateLineSchema = createLineSchema.partial();

export const unpostDocumentSchema = z.object({
  reason: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
});
