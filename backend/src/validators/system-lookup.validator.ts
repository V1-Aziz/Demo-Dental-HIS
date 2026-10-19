import { z } from 'zod';

export const createLookupValueSchema = z.object({
  valueLabel:   z.string().min(1).max(150).trim(),
  displayOrder: z.number().int().nonnegative().optional(),
});

export const updateLookupValueSchema = z.object({
  valueLabel:   z.string().min(1).max(150).trim().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  isActive:     z.boolean().optional(),
  duration:     z.number().int().positive().optional(),
  description:  z.string().max(500).optional(),
}).refine(
  obj => Object.keys(obj).length > 0,
  { message: 'At least one field to update is required' },
);

export const reorderLookupValuesSchema = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1),
});

export type CreateLookupValueInput  = z.infer<typeof createLookupValueSchema>;
export type UpdateLookupValueInput  = z.infer<typeof updateLookupValueSchema>;
export type ReorderLookupValuesInput = z.infer<typeof reorderLookupValuesSchema>;
