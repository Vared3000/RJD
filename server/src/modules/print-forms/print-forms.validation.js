import { z } from 'zod';

export const printFormQuerySchema = z.object({
  dpoId: z.string().uuid('Выберите ДПО').optional(),
  employeeId: z.string().uuid('Выберите работника').optional(),
  from: z.string().date('Некорректная дата начала').optional(),
  to: z.string().date('Некорректная дата окончания').optional(),
  format: z.enum(['xlsx', 'pdf']).default('xlsx'),
});
