import type { Prisma, Appointment, AuditEvent } from '../../../generated/prisma';
import { AppError } from '../../../shared/errors/AppError';
import { CreateAppointmentInput, ListAppointmentsInput } from '../domain/AppointmentSchema';

export type IPrismaTxAppointment = {
  appointment: {
    create(args: Prisma.AppointmentCreateArgs): Promise<Appointment>;
    findFirst(args: Prisma.AppointmentFindFirstArgs): Promise<Appointment | null>;
  };
  auditEvent: {
    create(args: Prisma.AuditEventCreateArgs): Promise<AuditEvent>;
  };
  patient: {
    findFirst(args: Prisma.PatientFindFirstArgs): Promise<any>;
  };
  membership: {
    findFirst(args: Prisma.MembershipFindFirstArgs): Promise<any>;
  };
};

export interface IAppointmentRepository {
  appointment: {
    findMany(args: Prisma.AppointmentFindManyArgs): Promise<Appointment[]>;
    findFirst(args: Prisma.AppointmentFindFirstArgs): Promise<Appointment | null>;
  };
  $transaction<T>(callback: (tx: IPrismaTxAppointment) => Promise<T>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T>;
}

export class AppointmentService {
  constructor(private readonly prisma: IAppointmentRepository) {}

  private normalizeString(str?: string | null): string | null {
    if (!str) return null;
    const clean = str.trim();
    return clean === '' ? null : clean;
  }

  async listAppointments(clinicId: string, input: ListAppointmentsInput) {
    const { startAt, endAt, professionalMembershipId, status } = input;
    const queryStart = new Date(startAt);
    const queryEnd = new Date(endAt);

    const where: any = {
      clinicId,
      startAt: { lt: queryEnd },
      endAt: { gt: queryStart }
    };

    if (professionalMembershipId) {
      where.professionalMembershipId = professionalMembershipId;
    }

    if (status) {
      where.status = status;
    }

    const items = await this.prisma.appointment.findMany({
      where,
      orderBy: [
        { startAt: 'asc' },
        { endAt: 'asc' },
        { id: 'asc' }
      ],
      select: {
        id: true,
        patientId: true,
        professionalMembershipId: true,
        startAt: true,
        endAt: true,
        status: true,
        reason: true,
        administrativeNotes: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return items;
  }

  async createAppointment(clinicId: string, membershipId: string, actorUserId: string, input: CreateAppointmentInput, actorRole: string) {
    const { patientId, professionalMembershipId, startAt, endAt, reason, administrativeNotes } = input;

    if (actorRole === 'PROFESSIONAL' && professionalMembershipId !== membershipId) {
      throw new AppError('FORBIDDEN', 'Un profesional solo puede agendarse a sí mismo', 403);
    }
    if (actorRole !== 'OWNER' && actorRole !== 'ASSISTANT' && actorRole !== 'PROFESSIONAL') {
      throw new AppError('FORBIDDEN', 'Rol no autorizado para crear citas', 403);
    }

    const newStart = new Date(startAt);
    const newEnd = new Date(endAt);
    const cleanReason = this.normalizeString(reason);
    const cleanNotes = this.normalizeString(administrativeNotes);

    const executeTx = async () => {
      return await this.prisma.$transaction(async (tx) => {
        const patient = await tx.patient.findFirst({
          where: { id: patientId, clinicId }
        });
        if (!patient) {
          throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
        }
        if (patient.status !== 'ACTIVE') {
          throw new AppError('PATIENT_INACTIVE', 'El paciente está inactivo.', 409);
        }

        const profMembership = await tx.membership.findFirst({
          where: { id: professionalMembershipId, clinicId }
        });
        if (!profMembership) {
          throw new AppError('NOT_FOUND', 'Profesional no encontrado.', 404);
        }
        if (profMembership.status !== 'ACTIVE' || (profMembership.role !== 'OWNER' && profMembership.role !== 'PROFESSIONAL')) {
          throw new AppError('INVALID_PROFESSIONAL', 'Membresía inválida o rol no autorizado para atención.', 400);
        }

        const overlap = await tx.appointment.findFirst({
          where: {
            clinicId,
            professionalMembershipId,
            status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
            startAt: { lt: newEnd },
            endAt: { gt: newStart }
          }
        });

        if (overlap) {
          throw new AppError('APPOINTMENT_CONFLICT', 'El horario se traslapa con otra cita del mismo profesional.', 409);
        }

        const appointment = await tx.appointment.create({
          data: {
            clinicId,
            patientId,
            professionalMembershipId,
            startAt: newStart,
            endAt: newEnd,
            status: 'SCHEDULED',
            reason: cleanReason,
            administrativeNotes: cleanNotes,
            createdByMembershipId: membershipId,
            updatedByMembershipId: membershipId
          }
        });

        await tx.auditEvent.create({
          data: {
            clinicId,
            actorUserId,
            action: 'APPOINTMENT_CREATED',
            entityType: 'Appointment',
            entityId: appointment.id,
            success: true,
            metadata: {
              patientId,
              professionalMembershipId,
              startAt: newStart.toISOString(),
              endAt: newEnd.toISOString(),
              status: 'SCHEDULED'
            }
          }
        });

        return appointment;
      }, { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel });
    };

    let attempts = 0;
    while (attempts < 3) {
      try {
        return await executeTx();
      } catch (error: any) {
        if (error.code === 'P2034') {
          attempts++;
          if (attempts >= 3) {
            throw new AppError('APPOINTMENT_CONFLICT', 'No se pudo agendar la cita debido a alta concurrencia. Intente de nuevo.', 409);
          }
        } else {
          throw error;
        }
      }
    }
  }
}
