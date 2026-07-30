import { z } from 'zod';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

export const createDocumentSchema = z.object({
  warehouseId: z.string().uuid('Выберите склад'),
  documentDate: z.string().min(1, 'Укажите дату'),
  note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
});

// warehouseId сознательно не редактируется после создания — строки уже
// сформированы снимком остатков именно этого склада (см. inventory.service.js).
export const updateDocumentSchema = z.object({
  documentDate: z.string().min(1).optional(),
  note: z.preprocess(emptyToNull, z.string().max(1000).nullable()).optional(),
});

export const updateLineSchema = z.object({
  confirmed: z.boolean().optional(),
  note: z.preprocess(emptyToNull, z.string().max(500).nullable()).optional(),
});
