import type { Prisma, Appointment, AuditEvent } from '../../../generated/prisma';
import { AppError } from '../../../shared/errors/AppError';
import {
  CreateAppointmentInput,
  ListAppointmentsInput,
  UpdateAppointmentInput,
  UpdateAppointmentStatusInput,
  CancelAppointmentInput
} from '../domain/AppointmentSchema';

export type IPrismaTxAppointment = {
  appointment: {
    create(args: Prisma.AppointmentCreateArgs): Promise<Appointment>;
    findFirst(args: Prisma.AppointmentFindFirstArgs): Promise<Appointment | null>;
    update(args: Prisma.AppointmentUpdateArgs): Promise<Appointment>;
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
    if (str === undefined) return undefined as any;
    if (str === null) return null;
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
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            secondLastName: true
          }
        },
        professional: {
          select: {
            id: true,
            role: true,
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    return items.map((item: any) => {
      const { professional, ...rest } = item;
      return {
        ...rest,
        professionalMembership: professional
      };
    });
  }

  async getAppointmentById(clinicId: string, id: string) {
    const item = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      select: {
        id: true,
        clinicId: true,
        patientId: true,
        professionalMembershipId: true,
        startAt: true,
        endAt: true,
        status: true,
        reason: true,
        administrativeNotes: true,
        createdAt: true,
        updatedAt: true,
        createdByMembershipId: true,
        updatedByMembershipId: true,
        cancelledAt: true,
        cancelledByMembershipId: true,
        cancellationReason: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            secondLastName: true,
            phone: true,
            email: true,
            status: true
          }
        },
        professional: {
          select: {
            id: true,
            role: true,
            status: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!item) {
      throw new AppError('NOT_FOUND', 'Cita no encontrada', 404);
    }

    const { professional, ...rest } = item as any;
    return {
      ...rest,
      professionalMembership: professional
    };
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

  async updateAppointment(clinicId: string, id: string, membershipId: string, actorUserId: string, actorRole: string, input: UpdateAppointmentInput) {
    const executeTx = async () => {
      return await this.prisma.$transaction(async (tx) => {
        const appointment = await tx.appointment.findFirst({
          where: { id, clinicId }
        });

        if (!appointment) {
          throw new AppError('NOT_FOUND', 'Cita no encontrada', 404);
        }

        if (appointment.status !== 'SCHEDULED' && appointment.status !== 'CONFIRMED') {
          throw new AppError('APPOINTMENT_NOT_EDITABLE', 'Solo pueden editarse citas en SCHEDULED o CONFIRMED', 409);
        }

        if (actorRole === 'PROFESSIONAL' && appointment.professionalMembershipId !== membershipId) {
          throw new AppError('FORBIDDEN', 'Un profesional solo puede editar sus propias citas', 403);
        }

        let newProfId = appointment.professionalMembershipId;
        if (input.professionalMembershipId && input.professionalMembershipId !== appointment.professionalMembershipId) {
          if (actorRole === 'PROFESSIONAL') {
            throw new AppError('FORBIDDEN', 'Un profesional no puede reasignar una cita a otro profesional', 403);
          }
          const profMembership = await tx.membership.findFirst({
            where: { id: input.professionalMembershipId, clinicId }
          });
          if (!profMembership) {
            throw new AppError('NOT_FOUND', 'Profesional no encontrado.', 404);
          }
          if (profMembership.status !== 'ACTIVE' || (profMembership.role !== 'OWNER' && profMembership.role !== 'PROFESSIONAL')) {
            throw new AppError('INVALID_PROFESSIONAL', 'Membresía inválida o rol no autorizado para atención.', 400);
          }
          newProfId = input.professionalMembershipId;
        }

        const data: any = {
          updatedByMembershipId: membershipId
        };
        const changedFields: string[] = [];

        let newStart = appointment.startAt;
        let newEnd = appointment.endAt;
        let isRescheduled = false;

        if (input.startAt && input.endAt) {
          const s = new Date(input.startAt);
          const e = new Date(input.endAt);
          if (s.getTime() !== appointment.startAt.getTime() || e.getTime() !== appointment.endAt.getTime()) {
            newStart = s;
            newEnd = e;
            data.startAt = newStart;
            data.endAt = newEnd;
            changedFields.push('startAt', 'endAt');
            isRescheduled = true;
          }
        }

        if (newProfId !== appointment.professionalMembershipId) {
          data.professionalMembershipId = newProfId;
          changedFields.push('professionalMembershipId');
          isRescheduled = true;
        }

        if (input.reason !== undefined) {
          const r = this.normalizeString(input.reason);
          if (r !== appointment.reason) {
            data.reason = r;
            changedFields.push('reason');
          }
        }

        if (input.administrativeNotes !== undefined) {
          const n = this.normalizeString(input.administrativeNotes);
          if (n !== appointment.administrativeNotes) {
            data.administrativeNotes = n;
            changedFields.push('administrativeNotes');
          }
        }

        if (changedFields.length === 0) {
          return appointment;
        }

        if (isRescheduled) {
          const overlap = await tx.appointment.findFirst({
            where: {
              clinicId,
              id: { not: id },
              professionalMembershipId: newProfId,
              status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
              startAt: { lt: newEnd },
              endAt: { gt: newStart }
            }
          });

          if (overlap) {
            throw new AppError('APPOINTMENT_CONFLICT', 'El horario se traslapa con otra cita del mismo profesional.', 409);
          }
        }

        const updated = await tx.appointment.update({
          where: { id },
          data
        });

        const action = isRescheduled ? 'APPOINTMENT_RESCHEDULED' : 'APPOINTMENT_UPDATED';
        const metadata: any = {
          appointmentId: id,
          changedFields
        };

        if (isRescheduled) {
          metadata.previousStartAt = appointment.startAt.toISOString();
          metadata.newStartAt = newStart.toISOString();
          metadata.previousEndAt = appointment.endAt.toISOString();
          metadata.newEndAt = newEnd.toISOString();
          metadata.previousProfessionalMembershipId = appointment.professionalMembershipId;
          metadata.newProfessionalMembershipId = newProfId;
        }

        await tx.auditEvent.create({
          data: {
            clinicId,
            actorUserId,
            action,
            entityType: 'Appointment',
            entityId: id,
            success: true,
            metadata
          }
        });

        return updated;
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
            throw new AppError('APPOINTMENT_CONFLICT', 'No se pudo reprogramar la cita debido a alta concurrencia. Intente de nuevo.', 409);
          }
        } else {
          throw error;
        }
      }
    }
  }

  async updateAppointmentStatus(clinicId: string, id: string, membershipId: string, actorUserId: string, actorRole: string, input: UpdateAppointmentStatusInput) {
    const { status: newStatus } = input;

    return await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: { id, clinicId }
      });

      if (!appointment) {
        throw new AppError('NOT_FOUND', 'Cita no encontrada', 404);
      }

      if (appointment.status === newStatus) {
        return appointment;
      }

      const current = appointment.status;

      // Roles checks
      if (actorRole === 'PROFESSIONAL' && appointment.professionalMembershipId !== membershipId) {
        throw new AppError('FORBIDDEN', 'Un profesional solo puede cambiar el estado de sus propias citas', 403);
      }
      if (actorRole === 'ASSISTANT' && (newStatus === 'IN_PROGRESS' || newStatus === 'COMPLETED')) {
        throw new AppError('FORBIDDEN', 'Un asistente no puede iniciar ni finalizar atención', 403);
      }

      // Valid transitions
      let valid = false;
      if (current === 'SCHEDULED' && ['CONFIRMED', 'IN_PROGRESS', 'NO_SHOW'].includes(newStatus)) valid = true;
      if (current === 'CONFIRMED' && ['IN_PROGRESS', 'NO_SHOW'].includes(newStatus)) valid = true;
      if (current === 'IN_PROGRESS' && ['COMPLETED'].includes(newStatus)) valid = true;

      if (!valid) {
        throw new AppError('INVALID_APPOINTMENT_TRANSITION', `Transición de estado no permitida desde ${current} hacia ${newStatus}`, 409);
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: newStatus,
          updatedByMembershipId: membershipId
        }
      });

      await tx.auditEvent.create({
        data: {
          clinicId,
          actorUserId,
          action: 'APPOINTMENT_STATUS_CHANGED',
          entityType: 'Appointment',
          entityId: id,
          success: true,
          metadata: {
            appointmentId: id,
            previousStatus: current,
            newStatus
          }
        }
      });

      return updated;
    }, { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel }); // Though Serializable might not be strictly needed for status if P2034 isn't caught, it's safer. Actually wait, P2034 logic is not requested for status and cancel, but it's okay. Wait, if P2034 throws here, we don't catch it. The user didn't ask for retry logic on status. So I won't add a retry block.
  }

  async cancelAppointment(clinicId: string, id: string, membershipId: string, actorUserId: string, actorRole: string, input: CancelAppointmentInput) {
    const { cancellationReason } = input;
    const cleanReason = this.normalizeString(cancellationReason);

    return await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: { id, clinicId }
      });

      if (!appointment) {
        throw new AppError('NOT_FOUND', 'Cita no encontrada', 404);
      }

      if (appointment.status === 'CANCELLED') {
        return appointment;
      }

      const current = appointment.status;

      if (['COMPLETED', 'NO_SHOW'].includes(current)) {
        throw new AppError('INVALID_APPOINTMENT_TRANSITION', `Citas ${current} no pueden ser canceladas`, 409);
      }

      if (actorRole === 'PROFESSIONAL' && appointment.professionalMembershipId !== membershipId) {
        throw new AppError('FORBIDDEN', 'Un profesional solo puede cancelar sus propias citas', 403);
      }

      if (actorRole === 'ASSISTANT' && current === 'IN_PROGRESS') {
        throw new AppError('FORBIDDEN', 'Un asistente no puede cancelar una cita en progreso', 403);
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByMembershipId: membershipId,
          cancellationReason: cleanReason,
          updatedByMembershipId: membershipId
        }
      });

      await tx.auditEvent.create({
        data: {
          clinicId,
          actorUserId,
          action: 'APPOINTMENT_CANCELLED',
          entityType: 'Appointment',
          entityId: id,
          success: true,
          metadata: {
            appointmentId: id,
            previousStatus: current,
            newStatus: 'CANCELLED',
            cancelledAt: updated.cancelledAt?.toISOString()
          }
        }
      });

      return updated;
    }, { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel });
  }
}
