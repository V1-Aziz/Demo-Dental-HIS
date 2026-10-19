import { z } from 'zod';

export const exportRequestSchema = z.object({
  reportKey: z.enum([
    'new-patient-registrations',
    'patient-demographics',
    'attendance-no-show',
    'clinic-occupancy',
    'low-stock-items',
    'consumption',
    'student-procedure-log',
    'supervisor-evaluation',
  ]),
  format: z.enum(['pdf', 'excel', 'csv']),
  sections: z.array(z.string()),
  filters: z.record(z.unknown()).default({}),
});

export type ExportRequestBody = z.infer<typeof exportRequestSchema>;
