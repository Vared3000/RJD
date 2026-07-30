import { z } from 'zod';

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

const optionalUuid = z.preprocess(
  emptyToNull,
  z.string().uuid('Некорректный идентификатор').nullable(),
);
const optionalDate = z.preprocess(emptyToNull, z.string().date().nullable());
const optionalString = (max) => z.preprocess(emptyToNull, z.string().max(max).nullable());

export const createEmployeeSchema = z.object({
  organizationId: z.string().uuid('Выберите организацию'),
  subdivisionId: optionalUuid.optional(),
  positionId: optionalUuid.optional(),
  dpoId: optionalUuid.optional(),
  fullName: z.string().min(1, 'Укажите ФИО').max(255),
  personnelNumber: optionalString(64).optional(),
  birthDate: optionalDate.optional(),
  hireDate: optionalDate.optional(),
  terminationDate: optionalDate.optional(),
  clothingSizeId: optionalUuid.optional(),
  heightSizeId: optionalUuid.optional(),
  shoeSizeId: optionalUuid.optional(),
  headwearSizeId: optionalUuid.optional(),
  beltSizeId: optionalUuid.optional(),
  glovesSizeId: optionalUuid.optional(),
  phone: optionalString(32).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();
