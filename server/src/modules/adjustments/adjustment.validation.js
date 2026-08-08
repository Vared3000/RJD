import { z } from 'zod';
import { INSTANCE_CONDITIONS } from '../../database/models/instance.model.js';

// Пустая строка из select/input на фронте -> null/undefined, иначе — как есть.
const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const emptyToUndefined = (value) => (value === '' || value === null ? undefined : value);

const optionalUuid = z.preprocess(
  emptyToNull,
  z.string().uuid('Некорректный идентификатор').nullable(),
);
const optionalCost = z.preprocess(emptyToNull, z.coerce.number().nonnegative().nullable());
const optionalNote = z.preprocess(emptyToNull, z.string().max(500).nullable()).optional();

export const createDocumentSchema = z.object({
  warehouseId: z.string().uuid('Выберите склад'),
  documentDate: z.string().min(1, 'Укажите дату'),
  note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
});

export const updateDocumentSchema = createDocumentSchema.partial();

export const createFromInventorySchema = z.object({
  documentDate: z.string().min(1, 'Укажите дату').optional(),
  note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
});

// Основание обязательно для всех типов строк — раздел "Корректировка"
// плана прямо требует, чтобы недостача не превращалась в обычное списание
// без документированной причины; то же требование применено единообразно
// ко всем 4 типам, а не только к shortage.
const reason = z.string().min(1, 'Укажите основание').max(500);

const surplusLineSchema = z.object({
  adjustmentType: z.literal('surplus'),
  modelId: z.string().uuid('Выберите модель'),
  sizeId: optionalUuid.optional(),
  heightSizeId: optionalUuid.optional(),
  toWarehouseId: z.string().uuid('Выберите склад'),
  toCondition: z.preprocess(
    emptyToUndefined,
    z.enum(INSTANCE_CONDITIONS).optional().default('good'),
  ),
  cost: optionalCost.optional(),
  reason,
  note: optionalNote,
});

const shortageLineSchema = z.object({
  adjustmentType: z.literal('shortage'),
  instanceId: z.string().uuid('Выберите экземпляр'),
  reason,
  note: optionalNote,
});

const relocateLineSchema = z.object({
  adjustmentType: z.literal('relocate'),
  instanceId: z.string().uuid('Выберите экземпляр'),
  toWarehouseId: z.string().uuid('Выберите склад'),
  reason,
  note: optionalNote,
});

const conditionLineSchema = z.object({
  adjustmentType: z.literal('condition'),
  instanceId: z.string().uuid('Выберите экземпляр'),
  toCondition: z.enum(INSTANCE_CONDITIONS, { errorMap: () => ({ message: 'Укажите состояние' }) }),
  reason,
  note: optionalNote,
});

export const createLineSchema = z.discriminatedUnion('adjustmentType', [
  surplusLineSchema,
  shortageLineSchema,
  relocateLineSchema,
  conditionLineSchema,
]);

// Тип строки не меняется при правке (иначе набор полей несопоставим) — тот
// же дискриминированный union, форма всегда отправляет данные строки целиком.
export const updateLineSchema = createLineSchema;
