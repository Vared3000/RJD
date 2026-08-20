import { z } from 'zod';

export const createDraftSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1, 'Выберите хотя бы одну задачу'),
});
