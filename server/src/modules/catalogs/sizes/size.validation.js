import { z } from 'zod';
import { SIZE_TYPES } from '../../../database/models/size.model.js';

export const createSizeSchema = z.object({
  type: z.enum(SIZE_TYPES),
  value: z.string().min(1, 'Укажите значение').max(32),
  sortOrder: z.coerce.number().int().default(0),
});

export const updateSizeSchema = createSizeSchema.partial();
