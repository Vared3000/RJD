import { z } from 'zod';
import { isKnownBusinessUnitCode } from './business-unit-codes.js';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

const optionalString = (max) => z.preprocess(emptyToNull, z.string().max(max).nullable());
const optionalDate = z.preprocess(emptyToNull, z.string().date().nullable());
const optionalBusinessUnitCode = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}$/, 'Код БЕ должен состоять ровно из четырёх цифр')
    .refine(isKnownBusinessUnitCode, 'Код БЕ отсутствует в утверждённом справочнике')
    .nullable(),
);

export const createDpoSchema = z.object({
  name: z.string().min(1, 'Укажите краткое наименование').max(255),
  fullName: z.string().min(1, 'Укажите полное наименование').max(500),
  code: optionalString(32).optional(),
  region: optionalString(255).optional(),
  address: optionalString(500).optional(),
  okpo: optionalString(16).optional(),
  businessUnitCode: optionalBusinessUnitCode.optional(),
  directorFullName: optionalString(255).optional(),
  directorFullNameGenitive: optionalString(255).optional(),
  directorBasis: optionalString(500).optional(),
  contractNumber: optionalString(128).optional(),
  contractDate: optionalDate.optional(),
  additionalAgreementNumber: optionalString(128).optional(),
  additionalAgreementDate: optionalDate.optional(),
});

export const updateDpoSchema = createDpoSchema.partial();
