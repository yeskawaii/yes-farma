import { PrismaClient, PatientDocument } from '../../../generated/prisma';
import {
  CreateAuditEventDto,
  CreatePatientDocumentDto,
  IPatientDocumentRepository,
} from '../application/IPatientDocumentRepository';

type PrismaTxDelegate = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

type PrismaDelegate = Pick<
  PrismaClient,
  'patient' | 'clinicalEncounter' | 'patientDocument' | 'auditEvent' | '$transaction'
> | PrismaTxDelegate;

export class PrismaPatientDocumentRepository implements IPatientDocumentRepository {
  constructor(private readonly prisma: PrismaDelegate) {}

  async findPatient(clinicId: string, patientId: string): Promise<{ id: string } | null> {
    const patient = await this.prisma.patient.findFirst({
      where: { clinicId, id: patientId },
      select: { id: true },
    });
    return patient;
  }

  async findEncounter(clinicId: string, patientId: string, encounterId: string): Promise<{ id: string } | null> {
    const encounter = await this.prisma.clinicalEncounter.findFirst({
      where: { clinicId, patientId, id: encounterId },
      select: { id: true },
    });
    return encounter;
  }

  async createDocument(data: CreatePatientDocumentDto): Promise<PatientDocument> {
    return this.prisma.patientDocument.create({
      data: {
        id: data.id,
        clinicId: data.clinicId,
        patientId: data.patientId,
        clinicalEncounterId: data.clinicalEncounterId,
        category: data.category,
        status: data.status,
        originalFileName: data.originalFileName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        sha256: data.sha256,
        storageProvider: data.storageProvider,
        storageBucket: data.storageBucket,
        storageKey: data.storageKey,
        uploadedByMembershipId: data.uploadedByMembershipId,
      },
    });
  }

  async findDocumentById(clinicId: string, documentId: string): Promise<PatientDocument | null> {
    return this.prisma.patientDocument.findFirst({
      where: { clinicId, id: documentId },
    });
  }

  async completeUploadAtomic(clinicId: string, documentId: string): Promise<{ count: number }> {
    const result = await this.prisma.patientDocument.updateMany({
      where: { clinicId, id: documentId, status: 'PENDING' },
      data: { status: 'ACTIVE' },
    });
    return { count: result.count };
  }

  async listActiveDocuments(clinicId: string, patientId: string): Promise<PatientDocument[]> {
    return this.prisma.patientDocument.findMany({
      where: { clinicId, patientId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async softDeleteDocumentAtomic(clinicId: string, documentId: string, membershipId: string): Promise<{ count: number }> {
    const result = await this.prisma.patientDocument.updateMany({
      where: { clinicId, id: documentId, status: 'ACTIVE' },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletedByMembershipId: membershipId,
      },
    });
    return { count: result.count };
  }

  async createAuditEvent(data: CreateAuditEventDto): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        clinicId: data.clinicId,
        actorUserId: data.actorUserId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
    });
  }

  async $transaction<T>(cb: (tx: IPatientDocumentRepository) => Promise<T>): Promise<T> {
    if ('$transaction' in this.prisma) {
      return this.prisma.$transaction(async (tx: PrismaTxDelegate) => {
        return cb(new PrismaPatientDocumentRepository(tx));
      });
    } else {
      // Si ya estamos dentro de una transacción (this.prisma no tiene $transaction),
      // simplemente pasamos "this" para reutilizar la transacción actual.
      return cb(this);
    }
  }
}
