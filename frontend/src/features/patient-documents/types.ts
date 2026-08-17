export type DocumentCategory =
  | 'RADIOGRAPH'
  | 'LAB_RESULT'
  | 'PRESCRIPTION'
  | 'CONSENT'
  | 'IDENTIFICATION'
  | 'CLINICAL_IMAGE'
  | 'REFERRAL'
  | 'OTHER';

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'RADIOGRAPH',
  'LAB_RESULT',
  'PRESCRIPTION',
  'CONSENT',
  'IDENTIFICATION',
  'CLINICAL_IMAGE',
  'REFERRAL',
  'OTHER',
];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export type DocumentStatus = 'PENDING' | 'ACTIVE' | 'DELETED';

export interface PatientDocument {
  id: string;
  patientId: string;
  clinicalEncounterId: string | null;
  category: DocumentCategory;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface UploadDocumentInput {
  patientId: string;
  clinicalEncounterId?: string;
  category: DocumentCategory;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  originalFileName: string;
  sha256?: string;
}

export interface UploadUrlResponse {
  documentId: string;
  uploadUrl: string;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
}

export interface PreviewUrlResponse {
  previewUrl: string;
}
