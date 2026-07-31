import { z } from 'zod';
import { KIT_SEASONS } from '../../database/models/position-kit-item.model.js';

export const createKitItemSchema = z.object({
  positionId: z.string().uuid('Выберите должность'),
  modelId: z.string().uuid('Выберите модель'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля').default(1),
  season: z.enum(KIT_SEASONS, { errorMap: () => ({ message: 'Выберите сезон' }) }),
  serviceLifeYears: z.coerce
    .number()
    .int()
    .min(1, 'Срок должен быть не меньше одного года')
    .max(20, 'Срок должен быть не больше 20 лет')
    .optional(),
});

export const updateKitItemSchema = createKitItemSchema.partial();
