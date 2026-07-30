import { z } from 'zod';

export const createKitItemSchema = z.object({
  positionId: z.string().uuid('Выберите должность'),
  modelId: z.string().uuid('Выберите модель'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля').default(1),
});

export const updateKitItemSchema = createKitItemSchema.partial();
