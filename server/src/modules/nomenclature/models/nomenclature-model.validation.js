import { z } from 'zod';
import { SIZE_TYPES } from '../../../database/models/size.model.js';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

export const createNomenclatureModelSchema = z.object({
  name: z.string().min(1, 'Укажите название').max(255),
  article: z.string().max(64).optional().nullable().or(z.literal('')),
  unit: z.string().max(16).default('шт'),
  // Тип размера, которым укомплектовывается модель (одежда/рост/обувь) —
  // используется при автоподборе комплекта по должности (Этап 8): по нему
  // выбирается, какой из трёх размеров работника подставить.
  sizeType: z.preprocess(emptyToNull, z.enum(SIZE_TYPES).nullable()),
  description: z.string().max(1000).optional().nullable().or(z.literal('')),
});

export const updateNomenclatureModelSchema = createNomenclatureModelSchema.partial();
