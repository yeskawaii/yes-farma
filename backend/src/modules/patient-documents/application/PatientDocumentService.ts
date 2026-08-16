import { AppError } from '../../../shared/errors/AppError';
import { ObjectStorageProvider } from '../infrastructure/ObjectStorageProvider';
import {
  UploadDocumentInput,
  ListDocumentsQuery,
} from '../domain/PatientDocumentSchema';
import { IPatientDocumentRepository } from './IPatientDocumentRepository';

export function checkMagicBytes(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === 'application/pdf') {
    return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2D;
  }
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  }
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}

export class PatientDocumentService {
  constructor(
    private readonly prisma: IPatientDocumentRepository,
    private readonly storageProvider: ObjectStorageProvider,
    private readonly storageConfig: {
      bucketName: string;
      uploadUrlTtlSeconds: number;
      downloadUrlTtlSeconds: number;
    }
  ) { }

  async createUploadUrl(
    clinicId: string,
    membershipId: string,
    input: UploadDocumentInput
  ) {
    // Validate patient exists in clinic
    const patient = await this.prisma.findPatient(clinicId, input.patientId);

    if (!patient) {
      throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
    }

    // Validate encounter if provided
    if (input.clinicalEncounterId) {
      const encounter = await this.prisma.findEncounter(
        clinicId,
        input.patientId,
        input.clinicalEncounterId
      );

      if (!encounter) {
        throw new AppError('NOT_FOUND', 'Encuentro clínico no encontrado o no pertenece a este paciente.', 404);
      }
    }

    // Create DB record
    const documentId = crypto.randomUUID();
    const storageKey = `clinics/${clinicId}/patients/${input.patientId}/documents/${documentId}/original`;

    const document = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.createDocument({
        id: documentId,
        clinicId,
        patientId: input.patientId,
        clinicalEncounterId: input.clinicalEncounterId ?? null,
        category: input.category,
        status: 'PENDING',
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256 ?? null,
        storageProvider: 'CLOUDFLARE_R2',
        storageBucket: this.storageConfig.bucketName,
        storageKey,
        uploadedByMembershipId: membershipId,
      });
      return doc;
    });

    const uploadUrl = await this.storageProvider.createUploadUrl({
      key: storageKey,
      contentType: input.mimeType,
      expiresInSeconds: this.storageConfig.uploadUrlTtlSeconds,
    });

    return {
      documentId: document.id,
      uploadUrl,
    };
  }

  async completeUpload(
    clinicId: string,
    userId: string,
    documentId: string
  ) {
    const document = await this.prisma.findDocumentById(clinicId, documentId);

    if (!document) {
      throw new AppError('NOT_FOUND', 'Documento no encontrado.', 404);
    }

    if (document.status === 'DELETED') {
      throw new AppError('BAD_REQUEST', 'El documento está eliminado.', 400);
    }

    if (document.status === 'ACTIVE') {
      // Idempotent success
      return document;
    }

    // Verify object in storage
    const headResult = await this.storageProvider.headObject(document.storageKey);

    if (!headResult.exists) {
      throw new AppError('BAD_REQUEST', 'El archivo no ha sido subido al almacenamiento.', 400);
    }

    if (headResult.contentLength !== document.sizeBytes) {
      throw new AppError('BAD_REQUEST', 'El tamaño del archivo subido no coincide con el registrado.', 400);
    }

    if (headResult.contentType !== document.mimeType) {
      throw new AppError('BAD_REQUEST', 'El tipo de archivo subido no coincide con el registrado.', 400);
    }

    // Magic Bytes Verification
    const partialBytes = await this.storageProvider.getPartialObject(document.storageKey, 16);
    if (!checkMagicBytes(document.mimeType, partialBytes)) {
      throw new AppError('BAD_REQUEST', 'El contenido del archivo no coincide con su tipo.', 400);
    }

    // Update status and audit atomically
    const updatedDocument = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.completeUploadAtomic(clinicId, documentId);

      if (updateResult.count === 0) {
        // Fallback for concurrency: query with clinicId isolation
        const docFallback = await tx.findDocumentById(clinicId, documentId);

        if (!docFallback) {
          throw new AppError('NOT_FOUND', 'Documento no encontrado.', 404);
        }
        if (docFallback.status === 'DELETED') {
          throw new AppError('BAD_REQUEST', 'El documento está eliminado.', 400);
        }
        if (docFallback.status === 'PENDING') {
          throw new AppError('CONFLICT', 'Conflicto al actualizar el estado del documento.', 409);
        }
        // ACTIVE -> idempotent success without creating AuditEvent
        return docFallback;
      }

      const doc = await tx.findDocumentById(clinicId, documentId);
      if (!doc) throw new AppError('NOT_FOUND', 'Documento no encontrado.', 404);

      await tx.createAuditEvent({
        clinicId,
        actorUserId: userId,
        action: 'PATIENT_DOCUMENT_UPLOADED',
        entityType: 'PatientDocument',
        entityId: documentId,
        metadata: {
          category: document.category,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          encounterLinked: !!document.clinicalEncounterId,
        },
      });

      return doc;
    });

    return updatedDocument;
  }

  async listDocuments(clinicId: string, query: ListDocumentsQuery) {
    const documents = await this.prisma.listActiveDocuments(clinicId, query.patientId);

    return documents.map(doc => ({
      id: doc.id,
      patientId: doc.patientId,
      clinicalEncounterId: doc.clinicalEncounterId,
      category: doc.category,
      originalFileName: doc.originalFileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
    }));
  }

  async getDownloadUrl(
    clinicId: string,
    userId: string,
    documentId: string
  ) {
    const document = await this.prisma.findDocumentById(clinicId, documentId);

    if (!document) {
      throw new AppError('NOT_FOUND', 'Documento no encontrado.', 404);
    }

    if (document.status !== 'ACTIVE') {
      throw new AppError('NOT_FOUND', 'El documento no está disponible para descarga.', 404);
    }

    const downloadUrl = await this.storageProvider.createDownloadUrl({
      key: document.storageKey,
      expiresInSeconds: this.storageConfig.downloadUrlTtlSeconds,
      downloadFileName: document.originalFileName,
    });

    await this.prisma.createAuditEvent({
      clinicId,
      actorUserId: userId,
      action: 'PATIENT_DOCUMENT_DOWNLOADED',
      entityType: 'PatientDocument',
      entityId: documentId,
      metadata: {
        category: document.category,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        encounterLinked: !!document.clinicalEncounterId,
      },
    });

    return { downloadUrl };
  }

  async deleteDocument(
    clinicId: string,
    membershipId: string,
    userId: string,
    documentId: string
  ) {
    const document = await this.prisma.findDocumentById(clinicId, documentId);

    if (!document) {
      throw new AppError('NOT_FOUND', 'Documento no encontrado.', 404);
    }

    if (document.status === 'DELETED') {
      return document;
    }

    if (document.status === 'PENDING') {
      throw new AppError('BAD_REQUEST', 'No se puede eliminar un documento pendiente. Complete la subida primero.', 400);
    }

    const deletedDocument = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.softDeleteDocumentAtomic(clinicId, documentId, membershipId);

      if (updateResult.count === 0) {
        const docFallback = await tx.findDocumentById(clinicId, documentId);
        if (!docFallback) throw new AppError('NOT_FOUND', 'Documento no encontrado.', 404);
        if (docFallback.status === 'DELETED') {
          return docFallback;
        }
        throw new AppError('CONFLICT', 'Conflicto al eliminar el documento.', 409);
      }

      await tx.createAuditEvent({
        clinicId,
        actorUserId: userId,
        action: 'PATIENT_DOCUMENT_DELETED',
        entityType: 'PatientDocument',
        entityId: documentId,
        metadata: {
          category: document.category,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          encounterLinked: !!document.clinicalEncounterId,
        },
      });

      const doc = await tx.findDocumentById(clinicId, documentId);
      if (!doc) throw new AppError('NOT_FOUND', 'Documento no encontrado.', 404);
      return doc;
    });

    return deletedDocument;
  }
}
