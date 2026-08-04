import { z } from 'zod';

const isoStringWithOffsetOrZ = z.string().refine(
  (val) => {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(val);
  },
  { message: 'Invalid ISO 8601 string. Must include Z or explicit offset.' }
);

export const createAppointmentSchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID'),
  professionalMembershipId: z.string().uuid('professionalMembershipId must be a valid UUID'),
  startAt: isoStringWithOffsetOrZ,
  endAt: isoStringWithOffsetOrZ,
  reason: z.string().trim().max(300).optional().nullable().or(z.literal('')),
  administrativeNotes: z.string().trim().max(1000).optional().nullable().or(z.literal(''))
}).refine(
  (data) => new Date(data.startAt) < new Date(data.endAt),
  { message: 'endAt must be strictly greater than startAt', path: ['endAt'] }
).refine(
  (data) => {
    const start = new Date(data.startAt).getTime();
    const end = new Date(data.endAt).getTime();
    const diffMins = (end - start) / 60000;
    return diffMins >= 10 && diffMins <= 480;
  },
  { message: 'Duration must be between 10 and 480 minutes', path: ['endAt'] }
).refine(
  (data) => {
    const start = new Date(data.startAt).getTime();
    const now = Date.now();
    return start >= now - 5 * 60000;
  },
  { message: 'startAt cannot be clearly in the past', path: ['startAt'] }
).refine(
  (data) => {
    const start = new Date(data.startAt).getTime();
    const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
    return start <= oneYearFromNow;
  },
  { message: 'startAt cannot be more than 1 year in the future', path: ['startAt'] }
);

export const listAppointmentsSchema = z.object({
  startAt: isoStringWithOffsetOrZ,
  endAt: isoStringWithOffsetOrZ,
  professionalMembershipId: z.string().uuid().optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional()
}).refine(
  (data) => new Date(data.startAt) < new Date(data.endAt),
  { message: 'endAt must be strictly greater than startAt', path: ['endAt'] }
).refine(
  (data) => {
    const start = new Date(data.startAt).getTime();
    const end = new Date(data.endAt).getTime();
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    return diffDays <= 35;
  },
  { message: 'Range cannot exceed 35 days', path: ['endAt'] }
);

export const updateAppointmentSchema = z.object({
  professionalMembershipId: z.string().uuid().optional(),
  startAt: isoStringWithOffsetOrZ.optional(),
  endAt: isoStringWithOffsetOrZ.optional(),
  reason: z.string().trim().max(300).optional().nullable().or(z.literal('')),
  administrativeNotes: z.string().trim().max(1000).optional().nullable().or(z.literal(''))
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
).refine(
  (data) => {
    if (data.startAt || data.endAt) {
      return !!(data.startAt && data.endAt);
    }
    return true;
  },
  { message: 'startAt and endAt must be provided together', path: ['startAt'] }
).refine(
  (data) => {
    if (data.startAt && data.endAt) {
      return new Date(data.startAt) < new Date(data.endAt);
    }
    return true;
  },
  { message: 'endAt must be strictly greater than startAt', path: ['endAt'] }
).refine(
  (data) => {
    if (data.startAt && data.endAt) {
      const start = new Date(data.startAt).getTime();
      const end = new Date(data.endAt).getTime();
      const diffMins = (end - start) / 60000;
      return diffMins >= 10 && diffMins <= 480;
    }
    return true;
  },
  { message: 'Duration must be between 10 and 480 minutes', path: ['endAt'] }
).refine(
  (data) => {
    if (data.startAt) {
      const start = new Date(data.startAt).getTime();
      const now = Date.now();
      return start >= now - 5 * 60000;
    }
    return true;
  },
  { message: 'startAt cannot be clearly in the past', path: ['startAt'] }
).refine(
  (data) => {
    if (data.startAt) {
      const start = new Date(data.startAt).getTime();
      const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
      return start <= oneYearFromNow;
    }
    return true;
  },
  { message: 'startAt cannot be more than 1 year in the future', path: ['startAt'] }
);

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW'])
});

export const cancelAppointmentSchema = z.object({
  cancellationReason: z.string().trim().max(500).optional().nullable().or(z.literal(''))
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type ListAppointmentsInput = z.infer<typeof listAppointmentsSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
