import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalDigits = (length) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${length}}$`))
    .optional()
    .or(z.literal(''));

export const createPrintFormPartySchema = z.object({
  role: z.enum(['executor', 'customer']),
  effectiveDate: z.string().date(),
  fullName: z.string().trim().min(2).max(2000),
  shortName: z.string().trim().min(2).max(255),
  inn: z
    .string()
    .trim()
    .regex(/^\d{10}(\d{2})?$/, 'ИНН должен содержать 10 или 12 цифр'),
  kpp: optionalDigits(9),
  address: z.string().trim().min(2).max(2000),
  okpo: z
    .string()
    .trim()
    .regex(/^\d{8}(\d{2})?$/)
    .optional()
    .or(z.literal('')),
  directorFullName: z.string().trim().min(2).max(255),
  directorPosition: z.string().trim().min(2).max(255),
  directorBasis: z.string().trim().min(2).max(255),
  bankName: optionalText(2000),
  bik: optionalDigits(9),
  correspondentAccount: optionalDigits(20),
  settlementAccount: optionalDigits(20),
  contractNumber: optionalText(255),
  contractDate: z.string().date().optional().or(z.literal('')),
});
