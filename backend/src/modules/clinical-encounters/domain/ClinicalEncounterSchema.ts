import { z } from 'zod';

const isoStringWithOffsetOrZ = z.string().refine(
  (val) => {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(val);
  },
  { message: 'Invalid ISO 8601 string. Must include Z or explicit offset.' }
);

export const createClinicalEncounterSchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID'),
  appointmentId: z.string().uuid('appointmentId must be a valid UUID').optional(),
  occurredAt: isoStringWithOffsetOrZ,
}).strict();

export const listClinicalEncountersSchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID'),
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(50).optional().default(20),
});

export type CreateClinicalEncounterInput = z.infer<typeof createClinicalEncounterSchema>;
export type ListClinicalEncountersInput = z.infer<typeof listClinicalEncountersSchema>;
