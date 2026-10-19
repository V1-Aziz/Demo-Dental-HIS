import { z } from 'zod';

const contactSchema = z.object({
  contactType: z.enum(['Email', 'Mobile', 'Work phone', 'Home phone']),
  value: z.string().min(1),
  isPrimary: z.boolean(),
}).refine(
  (c) => {
    if (c.contactType === 'Email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value);
    return /^\+?\d{8,15}$/.test(c.value);
  },
  { message: 'Invalid contact value format' },
);

export const submitRegistrationSchema = z.object({
  firstName:       z.string().min(1).max(100).trim(),
  middleName:      z.string().min(1).max(100).trim(),
  lastName:        z.string().min(1).max(100).trim(),
  civilId:         z.string().regex(/^\d{10}$/, 'Civil ID must be exactly 10 digits'),
  requestedRoleId: z.number().int().positive(),
  password:        z.string().min(8).refine(
    p => /[a-zA-Z]/.test(p) && /\d/.test(p),
    { message: 'Password must contain at least one letter and one digit' },
  ),
  contacts: z.array(contactSchema)
    .min(1, 'At least one contact is required')
    .refine(
      cs => cs.filter(c => c.isPrimary).length === 1,
      { message: 'Exactly one contact must be marked as primary' },
    )
    .refine(
      cs => new Set(cs.map(c => c.value)).size === cs.length,
      { message: 'Contact values must be unique' },
    ),
});

export const approveRegistrationSchema = z.object({
  supervisingEmployeeId: z.number().int().positive().optional(),
  defaultClinicId:       z.number().int().positive().optional(),
  hireDate:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  academicLevel:         z.number().int().min(1).max(10).optional(),
});

export const rejectRegistrationSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(500),
});

export type SubmitRegistrationInput  = z.infer<typeof submitRegistrationSchema>;
export type ApproveRegistrationInput = z.infer<typeof approveRegistrationSchema>;
export type RejectRegistrationInput  = z.infer<typeof rejectRegistrationSchema>;
