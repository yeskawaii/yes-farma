import type { Prisma, Patient, AuditEvent } from '../../../generated/prisma';
import { AppError } from '../../../shared/errors/AppError';
import { CreatePatientInput, ListPatientsInput, UpdatePatientInput } from '../domain/PatientSchema';

export type IPrismaTx = {
  patient: {
    create(args: Prisma.PatientCreateArgs): Promise<Patient>;
    update(args: Prisma.PatientUpdateArgs): Promise<Patient>;
  };
  auditEvent: {
    create(args: Prisma.AuditEventCreateArgs): Promise<AuditEvent>;
  };
};

export interface IPatientRepository {
  patient: {
    findMany(args: Prisma.PatientFindManyArgs): Promise<Patient[]>;
    findFirst(args: Prisma.PatientFindFirstArgs): Promise<Patient | null>;
    count(args: Prisma.PatientCountArgs): Promise<number>;
  };
  $transaction<T>(callback: (tx: IPrismaTx) => Promise<T>): Promise<T>;
}

export class PatientService {
  constructor(private readonly prisma: IPatientRepository) {}

  private normalizePhone(phone?: string | null): string | null {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, '');
    return clean === '' ? null : clean;
  }

  private normalizeEmail(email?: string | null): string | null {
    if (!email) return null;
    const clean = email.trim().toLowerCase();
    return clean === '' ? null : clean;
  }

  private normalizeString(str?: string | null): string | null {
    if (!str) return null;
    const clean = str.trim();
    return clean === '' ? null : clean;
  }

  async listPatients(clinicId: string, input: ListPatientsInput) {
    const { q, status, page, pageSize } = input;
    const skip = (page - 1) * pageSize;

    const where: any = { clinicId };
    
    if (status) {
      where.status = status;
    }

    if (q) {
      const qNorm = q.trim();
      where.OR = [
        { firstName: { contains: qNorm, mode: 'insensitive' } },
        { lastName: { contains: qNorm, mode: 'insensitive' } },
        { secondLastName: { contains: qNorm, mode: 'insensitive' } },
        { phone: { contains: qNorm } },
        { email: { contains: qNorm.toLowerCase() } }
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
          { id: 'asc' }
        ],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          secondLastName: true,
          birthDate: true,
          sexAtBirth: true,
          phone: true,
          email: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      this.prisma.patient.count({ where })
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  async createPatient(clinicId: string, membershipId: string, actorUserId: string, input: CreatePatientInput) {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const secondLastName = this.normalizeString(input.secondLastName);
    const phone = this.normalizePhone(input.phone);
    const email = this.normalizeEmail(input.email);
    const birthDate = input.birthDate ? new Date(input.birthDate) : null;
    const sexAtBirth = input.sexAtBirth || null;
    const administrativeNotes = this.normalizeString(input.administrativeNotes);

    if (!input.confirmPossibleDuplicate) {
      const duplicateWhere: any = {
        clinicId,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' }
      };
      
      const potentialDuplicates = await this.prisma.patient.findMany({ where: duplicateWhere });
      
      const isDuplicate = potentialDuplicates.some((p: any) => {
        if (birthDate && p.birthDate && birthDate.getTime() === p.birthDate.getTime()) return true;
        if (phone && p.phone === phone) return true;
        if (email && p.email === email) return true;
        return false;
      });

      if (isDuplicate) {
        throw new AppError('POSSIBLE_DUPLICATE', 'Posible paciente duplicado encontrado.', 409);
      }
    }

    const patient = await this.prisma.$transaction(async (tx) => {
      const p = await tx.patient.create({
        data: {
          clinicId,
          firstName,
          lastName,
          secondLastName,
          birthDate,
          sexAtBirth,
          phone,
          email,
          administrativeNotes,
          createdByMembershipId: membershipId,
          updatedByMembershipId: membershipId
        }
      });

      await tx.auditEvent.create({
        data: {
          clinicId,
          actorUserId,
          action: 'PATIENT_CREATED',
          entityType: 'Patient',
          entityId: p.id,
          success: true,
          metadata: {
            firstName: p.firstName,
            lastName: p.lastName
          }
        }
      });

      return p;
    });

    return patient;
  }

  async getPatientById(clinicId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinicId }
    });

    if (!patient) {
      throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
    }

    return patient;
  }

  async updatePatient(clinicId: string, id: string, membershipId: string, actorUserId: string, input: UpdatePatientInput) {
    const existing = await this.prisma.patient.findFirst({
      where: { id, clinicId }
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
    }

    const dataToUpdate: any = {};
    if (input.firstName !== undefined) dataToUpdate.firstName = input.firstName.trim();
    if (input.lastName !== undefined) dataToUpdate.lastName = input.lastName.trim();
    if (input.secondLastName !== undefined) dataToUpdate.secondLastName = this.normalizeString(input.secondLastName);
    if (input.birthDate !== undefined) dataToUpdate.birthDate = input.birthDate ? new Date(input.birthDate) : null;
    if (input.sexAtBirth !== undefined) dataToUpdate.sexAtBirth = input.sexAtBirth || null;
    if (input.phone !== undefined) dataToUpdate.phone = this.normalizePhone(input.phone);
    if (input.email !== undefined) dataToUpdate.email = this.normalizeEmail(input.email);
    if (input.administrativeNotes !== undefined) dataToUpdate.administrativeNotes = this.normalizeString(input.administrativeNotes);

    if (Object.keys(dataToUpdate).length === 0) {
      return existing;
    }

    dataToUpdate.updatedByMembershipId = membershipId;

    const patient = await this.prisma.$transaction(async (tx) => {
      const p = await tx.patient.update({
        where: { id },
        data: dataToUpdate
      });

      await tx.auditEvent.create({
        data: {
          clinicId,
          actorUserId,
          action: 'PATIENT_UPDATED',
          entityType: 'Patient',
          entityId: p.id,
          success: true,
          metadata: {
            updatedFields: Object.keys(dataToUpdate)
          }
        }
      });

      return p;
    });

    return patient;
  }

  async deactivatePatient(clinicId: string, id: string, membershipId: string, actorUserId: string) {
    const existing = await this.prisma.patient.findFirst({
      where: { id, clinicId }
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
    }

    if (existing.status === 'INACTIVE') {
      return existing; // idempotent
    }

    const patient = await this.prisma.$transaction(async (tx) => {
      const p = await tx.patient.update({
        where: { id },
        data: {
          status: 'INACTIVE',
          deactivatedAt: new Date(),
          deactivatedByMembershipId: membershipId,
          updatedByMembershipId: membershipId
        }
      });

      await tx.auditEvent.create({
        data: {
          clinicId,
          actorUserId,
          action: 'PATIENT_DEACTIVATED',
          entityType: 'Patient',
          entityId: p.id,
          success: true,
          metadata: {
            previousStatus: 'ACTIVE',
            newStatus: 'INACTIVE'
          }
        }
      });

      return p;
    });

    return patient;
  }

  async reactivatePatient(clinicId: string, id: string, membershipId: string, actorUserId: string) {
    const existing = await this.prisma.patient.findFirst({
      where: { id, clinicId }
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
    }

    if (existing.status === 'ACTIVE') {
      return existing; // idempotent
    }

    const patient = await this.prisma.$transaction(async (tx) => {
      const p = await tx.patient.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          deactivatedAt: null,
          deactivatedByMembershipId: null,
          updatedByMembershipId: membershipId
        }
      });

      await tx.auditEvent.create({
        data: {
          clinicId,
          actorUserId,
          action: 'PATIENT_REACTIVATED',
          entityType: 'Patient',
          entityId: p.id,
          success: true,
          metadata: {
            patientId: p.id,
            previousStatus: 'INACTIVE',
            newStatus: 'ACTIVE'
          }
        }
      });

      return p;
    });

    return patient;
  }
}
