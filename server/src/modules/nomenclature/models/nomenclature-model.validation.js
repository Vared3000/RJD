import { z } from 'zod';

export const createNomenclatureModelSchema = z.object({
  name: z.string().min(1, 'Укажите название').max(255),
  article: z.string().max(64).optional().nullable().or(z.literal('')),
  unit: z.string().max(16).default('шт'),
  description: z.string().max(1000).optional().nullable().or(z.literal('')),
});

export const updateNomenclatureModelSchema = createNomenclatureModelSchema.partial();
