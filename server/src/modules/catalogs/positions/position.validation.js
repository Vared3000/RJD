import { z } from 'zod';

export const createPositionSchema = z.object({
  name: z.string().min(1, 'Укажите название').max(255),
  code: z.string().max(64).optional().nullable(),
});

export const updatePositionSchema = createPositionSchema.partial();
