import { z } from 'zod';

const labelType = z.enum(['qr', 'code128']).default('qr');

export const printLabelsSchema = z.object({
  instanceIds: z.array(z.string().uuid()).min(1).max(500),
  labelType,
});

export const printLabelsByInventorySchema = z.object({
  inventoryNumbers: z.array(z.string().trim().min(1).max(64)).min(1).max(500),
  labelType,
});
