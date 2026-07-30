import { z } from 'zod';
import { INSTANCE_CONDITIONS } from '../../database/models/instance.model.js';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

// Общие zod-схемы для Стирки/Ремонта (см. service-document.factory.js) —
// у обоих документов одинаковая шапка и строка-создания (instanceId+note);
// отличается только строка завершения, если документ несёт доп. поля
// (у Ремонта — cost).
export function buildServiceDocumentSchemas({ lineExtraCompleteFields = [] } = {}) {
  const createDocumentSchema = z.object({
    warehouseId: z.string().uuid('Выберите склад'),
    documentDate: z.string().min(1, 'Укажите дату'),
    note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
  });

  const updateDocumentSchema = createDocumentSchema.partial();

  const createLineSchema = z.object({
    instanceId: z.string().uuid('Выберите экземпляр'),
    note: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
  });

  const completeLineSchema = z.object({
    lineId: z.string().uuid(),
    conditionAfter: z.enum(INSTANCE_CONDITIONS).optional(),
    ...(lineExtraCompleteFields.includes('cost')
      ? { cost: z.coerce.number().nonnegative().optional() }
      : {}),
  });

  const completeSchema = z.object({
    lines: z.array(completeLineSchema).min(1, 'Укажите хотя бы одну позицию'),
  });

  return { createDocumentSchema, updateDocumentSchema, createLineSchema, completeSchema };
}
