import { z } from 'zod';

export const printFormQuerySchema = z.object({
  dpoId: z.string().uuid('Выберите ДПО'),
  from: z.string().date('Некорректная дата начала'),
  to: z.string().date('Некорректная дата окончания'),
  format: z.enum(['xlsx', 'pdf']).default('xlsx'),
});
