import { z } from 'zod';
import { normalizePositionName } from './normalize-position-name.js';

export const createPositionSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(255).transform(normalizePositionName),
  code: z.string().max(64).optional().nullable(),
});

export const updatePositionSchema = createPositionSchema.partial();
