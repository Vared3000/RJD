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
  instanceId: z.string().uuid('Выберите экземпляр'),
  condition: z.enum(INSTANCE_CONDITIONS).default('good'),
  // Этап 9: куда направить экземпляр вместо склада — сразу в Стирку/Ремонт.
  routeTo: z.enum(['in_stock', 'laundry', 'repair']).default('in_stock'),
  note: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
});

export const updateLineSchema = createLineSchema.partial();
