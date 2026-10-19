// Zod schemas for the Screening_Requests endpoints.
import { z } from 'zod';

export const createScreeningRequestSchema = z.object({
  record_id:      z.number().int().positive(),
  patient_id:     z.number().int().positive(),
  appointment_id: z.number().int().positive().optional().nullable(),
});

export const cancelScreeningRequestSchema = z.object({});  // body unused; id comes from param

export type CreateScreeningRequestInput = z.infer<typeof createScreeningRequestSchema>;
