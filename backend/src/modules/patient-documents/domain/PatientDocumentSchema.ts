import { z } from 'zod';

export const documentCategories = [
  'RADIOGRAPH',
  'LAB_RESULT',
  'PRESCRIPTION',
  'CONSENT',
  'IDENTIFICATION',
  'CLINICAL_IMAGE',
  'REFERRAL',
  'OTHER',
] as const;

export const allowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export const uploadDocumentSchema = z.object({
  patientId: z.string().uuid(),
  clinicalEncounterId: z.string().uuid().optional(),
  category: z.enum(documentCategories),
  mimeType: z.enum(allowedMimeTypes),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  originalFileName: z.string().min(1).max(255),
  sha256: z
    .string()
    .length(64)
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const listDocumentsSchema = z.object({
  patientId: z.string().uuid(),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsSchema>;
