import { z } from 'zod';

const emptyToUndefined = (value) => (value === '' ? undefined : value);

const optionalUuid = (message) =>
  z.preprocess(emptyToUndefined, z.string().uuid(message).optional());
const optionalDate = (message) =>
  z.preprocess(emptyToUndefined, z.string().date(message).optional());

export const printFormQuerySchema = z.object({
  dpoId: optionalUuid('Выберите ДПО'),
  employeeId: optionalUuid('Выберите работника'),
  from: optionalDate('Некорректная дата начала'),
  to: optionalDate('Некорректная дата окончания'),
  format: z.enum(['xlsx', 'pdf']).default('xlsx'),
});
