import { z } from 'zod';
import { SIZE_TYPES } from '../../../database/models/size.model.js';
import {
  ALL_WEAR_MONTHS,
  GENDER_CATEGORIES,
  normalizeWearMonths,
} from '../../../database/models/nomenclature-model.model.js';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const wearMonthsSchema = z
  .array(z.number().int().min(1).max(12))
  .min(1, 'Выберите хотя бы один месяц эксплуатации')
  .transform(normalizeWearMonths);

const fields = {
  name: z.string().min(1, 'Укажите название').max(255),
  article: z.string().max(64).optional().nullable().or(z.literal('')),
  unit: z.string().max(16).default('шт'),
  // Тип размера, которым укомплектовывается модель — по нему автоподбор
  // комплекта выбирает соответствующий индивидуальный размер работника.
  sizeType: z.preprocess(emptyToNull, z.enum(SIZE_TYPES).nullable()),
  requiresHeightSize: z.boolean().default(false),
  // Категория модели по полу (раздел А2 ТЗ от 19.08.2026) — отдельно от
  // PositionKitItem.gender (применимость вещи в конкретном комплекте).
  genderCategory: z.enum(GENDER_CATEGORIES).default('unspecified'),
  wearMonths: wearMonthsSchema.default([...ALL_WEAR_MONTHS]),
  rentalPrice: z.coerce.number().nonnegative('Цена аренды не может быть отрицательной').default(0),
  rentalVatRate: z.coerce.number().min(0).max(100).default(5),
  description: z.string().max(1000).optional().nullable().or(z.literal('')),
};

function validateHeightAxis(data, context) {
  if (data.requiresHeightSize && data.sizeType !== 'clothing') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiresHeightSize'],
      message: 'Рост можно требовать только для моделей с типом размера «Одежда»',
    });
  }
}

export const createNomenclatureModelSchema = z.object(fields).superRefine(validateHeightAxis);

export const updateNomenclatureModelSchema = z
  .object({
    ...fields,
    name: fields.name.optional(),
    sizeType: fields.sizeType.optional(),
    requiresHeightSize: fields.requiresHeightSize.optional(),
    genderCategory: fields.genderCategory.optional(),
    wearMonths: wearMonthsSchema.optional(),
    rentalPrice: fields.rentalPrice.optional(),
    rentalVatRate: fields.rentalVatRate.optional(),
    unit: fields.unit.optional(),
  })
  .superRefine(validateHeightAxis);
