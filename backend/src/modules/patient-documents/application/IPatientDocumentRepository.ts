import { PatientDocument, Prisma } from '../../../generated/prisma';

export interface CreatePatientDocumentDto {
  id: string;
  clinicId: string;
  patientId: string;
  clinicalEncounterId: string | null;
  category: PatientDocument['category'];
  status: PatientDocument['status'];
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  storageProvider: string;
  storageBucket: string;
  storageKey: string;
  uploadedByMembershipId: string;
}

export interface CreateAuditEventDto {
  clinicId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

export interface IPatientDocumentRepository {
  findPatient(clinicId: string, patientId: string): Promise<{ id: string } | null>;
  findEncounter(clinicId: string, patientId: string, encounterId: string): Promise<{ id: string } | null>;
  createDocument(data: CreatePatientDocumentDto): Promise<PatientDocument>;
  findDocumentById(clinicId: string, documentId: string): Promise<PatientDocument | null>;
  completeUploadAtomic(clinicId: string, documentId: string): Promise<{ count: number }>;
  listActiveDocuments(clinicId: string, patientId: string): Promise<PatientDocument[]>;
  softDeleteDocumentAtomic(clinicId: string, documentId: string, membershipId: string): Promise<{ count: number }>;
  createAuditEvent(data: CreateAuditEventDto): Promise<void>;
  $transaction<T>(cb: (tx: IPatientDocumentRepository) => Promise<T>): Promise<T>;
}
