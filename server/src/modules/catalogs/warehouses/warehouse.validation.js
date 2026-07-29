import { z } from 'zod';

export const createWarehouseSchema = z.object({
  organizationId: z.string().uuid('Некорректный идентификатор организации'),
  name: z.string().min(1, 'Укажите название').max(255),
  code: z.string().max(64).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();
