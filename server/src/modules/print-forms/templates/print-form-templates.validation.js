import { z } from 'zod';

const emptyToUndefined = (value) => (value === '' ? undefined : value);

// dpoId/from/to обязательны и на загрузке, и на превью: вместо синтетических
// тестовых данных валидность шаблона подтверждается пробной генерацией на
// реальных параметрах (см. план задачи 19, раздел «Пробная генерация»).
export const uploadTemplateSchema = z.object({
  dpoId: z.string().uuid('Выберите ДПО'),
  from: z.string().date('Некорректная дата начала'),
  to: z.string().date('Некорректная дата окончания'),
  comment: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
});

export const previewQuerySchema = z.object({
  format: z.enum(['xlsx', 'pdf']).default('xlsx'),
  dpoId: z.string().uuid('Выберите ДПО'),
  from: z.string().date('Некорректная дата начала'),
  to: z.string().date('Некорректная дата окончания'),
});
