import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Укажите название').max(255),
  fullName: z.string().max(500).optional().nullable(),
  inn: z.string().max(12).optional().nullable(),
  kpp: z.string().max(9).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();
