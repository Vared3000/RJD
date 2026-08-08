import { z } from 'zod';
import { KIT_SEASONS, KIT_GENDERS } from '../../database/models/position-kit-item.model.js';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

export const createKitItemSchema = z.object({
  positionId: z.string().uuid('Выберите должность'),
  modelId: z.string().uuid('Выберите модель'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля').default(1),
  season: z.enum(KIT_SEASONS, { errorMap: () => ({ message: 'Выберите сезон' }) }),
  // Необязательно, в отличие от season: не у каждой позиции есть гендерный
  // вариант (бейдж, ремень и т.п. — унисекс).
  gender: z.preprocess(emptyToNull, z.enum(KIT_GENDERS).nullable().optional()),
  serviceLifeYears: z.coerce
    .number()
    .int()
    .min(1, 'Срок должен быть не меньше одного года')
    .max(20, 'Срок должен быть не больше 20 лет')
    .optional(),
});

export const updateKitItemSchema = createKitItemSchema.partial();
