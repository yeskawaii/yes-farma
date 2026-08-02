import { z } from 'zod';

export const createPatientSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  secondLastName: z.string().trim().max(100).optional().or(z.literal('')),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .refine((dateStr) => {
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d <= new Date();
    }, 'Invalid or future date')
    .optional()
    .or(z.literal('')),
  sexAtBirth: z.enum(['FEMALE', 'MALE', 'INTERSEX', 'UNKNOWN']).optional(),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email().max(254).optional().or(z.literal('')),
  administrativeNotes: z.string().max(2000).optional().or(z.literal('')),
  confirmPossibleDuplicate: z.boolean().optional(),
});

export const updatePatientSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100).optional(),
  lastName: z.string().trim().min(1, 'Last name is required').max(100).optional(),
  secondLastName: z.string().trim().max(100).optional().nullable().or(z.literal('')),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .refine((dateStr) => {
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d <= new Date();
    }, 'Invalid or future date')
    .optional()
    .nullable()
    .or(z.literal('')),
  sexAtBirth: z.enum(['FEMALE', 'MALE', 'INTERSEX', 'UNKNOWN']).optional().nullable(),
  phone: z.string().optional().nullable().or(z.literal('')),
  email: z.string().email().max(254).optional().nullable().or(z.literal('')),
  administrativeNotes: z.string().max(2000).optional().nullable().or(z.literal('')),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export const listPatientsSchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.preprocess((val) => val === undefined ? 1 : Number(val), z.number().int().min(1)),
  pageSize: z.preprocess((val) => val === undefined ? 20 : Number(val), z.number().int().min(1).max(50)),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type ListPatientsInput = z.infer<typeof listPatientsSchema>;
