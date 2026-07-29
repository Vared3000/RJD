import { z } from 'zod';
import { INSTANCE_STATUSES, INSTANCE_CONDITIONS } from '../../../database/models/instance.model.js';

// Пустая строка из select/input на фронте -> null, иначе — как есть.
const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

const optionalUuid = z.preprocess(
  emptyToNull,
  z.string().uuid('Некорректный идентификатор').nullable(),
);
const optionalCost = z.preprocess(emptyToNull, z.coerce.number().nonnegative().nullable());

export const createInstanceSchema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  sizeId: z.string().uuid('Выберите размер'),
  batchId: optionalUuid.optional(),
  warehouseId: optionalUuid.optional(),
  inventoryNumber: z.string().max(64).optional().nullable().or(z.literal('')),
  status: z.enum(INSTANCE_STATUSES).default('in_stock'),
  condition: z.enum(INSTANCE_CONDITIONS).default('new'),
  cost: optionalCost.optional(),
  employeeCost: optionalCost.optional(),
});

export const updateInstanceSchema = createInstanceSchema.partial();
