import { Prisma } from '../../../generated/prisma';
import { AppError } from '../../../shared/errors/AppError';
import { IClock, SystemClock } from '../../../shared/clock/ClockPort';

type DentalCareTransaction = Pick<Prisma.TransactionClient,
  'appointment' | 'clinic' | 'membership' | 'patient' | 'clinicalEncounter' | 'auditEvent'>;

export interface IDentalCareRepository {
  $transaction<T>(callback: (tx: DentalCareTransaction) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T>;
}

export interface DentalCareActor {
  clinicId: string;
  membershipId: string;
  userId: string;
  role: string;
}

// Also supplies the existing creation DTO without a second, post-commit read.
const encounterSelect = {
  id: true, clinicId: true, patientId: true, professionalMembershipId: true,
  appointmentId: true, status: true, version: true, occurredAt: true,
  createdAt: true, updatedAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, secondLastName: true } },
  professional: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
  appointment: { select: { id: true, startAt: true, endAt: true, status: true } }
} satisfies Prisma.ClinicalEncounterSelect;

export type StartCareResult = {
  created: boolean;
  appointment: { id: string; status: 'IN_PROGRESS' | 'COMPLETED' };
  encounter: Prisma.ClinicalEncounterGetPayload<{ select: typeof encounterSelect }>;
};

export function toStartCareResponse(result: StartCareResult) {
  const { id, patientId, professionalMembershipId, status, version } = result.encounter;
  return {
    created: result.created,
    appointment: result.appointment,
    encounter: { id, patientId, professionalMembershipId, status, version }
  };
}

function isAppointmentUniqueConflict(error: Prisma.PrismaClientKnownRequestError): boolean {
  if (error.code !== 'P2002') return false;
  const target = error.meta?.target;
  return (Array.isArray(target) && target.length === 1 && target[0] === 'appointmentId') ||
    target === 'appointmentId' || target === 'ClinicalEncounter_appointmentId_key';
}

export class DentalCareService {
  constructor(private readonly repository: IDentalCareRepository,
    private readonly clock: IClock = new SystemClock()) {}

  async finalizeCare(actor: DentalCareActor, encounterId: string, version: number): Promise<void> {
    const { clinicId, membershipId, userId, role } = actor;
    if (role !== 'OWNER' && role !== 'PROFESSIONAL') {
      throw new AppError('FORBIDDEN', 'Rol no autorizado para finalizar encuentros clínicos.', 403);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.repository.$transaction(async (tx) => {
          // Locate the optional link first. Prisma findFirst does not acquire a
          // FOR UPDATE lock. Subsequent reads and writes use Appointment -> Encounter;
          // Serializable + conditional updates protect the snapshot without manual SQL.
          const link = await tx.clinicalEncounter.findFirst({
            where: { id: encounterId, clinicId },
            select: { appointmentId: true }
          });
          if (!link) throw new AppError('NOT_FOUND', 'Encuentro no encontrado.', 404);

          const appointment = link.appointmentId
            ? await tx.appointment.findFirst({ where: { id: link.appointmentId, clinicId } })
            : null;
          if (link.appointmentId && !appointment) {
            throw new AppError('NOT_FOUND', 'Cita no encontrada.', 404);
          }
          const encounter = await tx.clinicalEncounter.findFirst({
            where: { id: encounterId, clinicId },
            select: { id: true, appointmentId: true, patientId: true, professionalMembershipId: true,
              status: true, version: true }
          });
          if (!encounter) throw new AppError('NOT_FOUND', 'Encuentro no encontrado.', 404);

          const membership = await tx.membership.findFirst({
            where: { id: membershipId, clinicId, userId },
            select: { status: true, role: true, user: { select: { status: true } } }
          });
          if (!membership || membership.status !== 'ACTIVE' || membership.role !== role ||
            membership.user.status !== 'ACTIVE' || encounter.professionalMembershipId !== membershipId) {
            throw new AppError('FORBIDDEN', 'Solo el profesional responsable puede finalizar este encuentro.', 403);
          }

          const inconsistent = () => new AppError('CARE_STATE_INCONSISTENT',
            'Los estados o vínculos de la cita y consulta son inconsistentes.', 409);
          if (appointment) {
            if (encounter.appointmentId !== appointment.id || encounter.patientId !== appointment.patientId ||
              encounter.professionalMembershipId !== appointment.professionalMembershipId) throw inconsistent();
            if (encounter.status === 'FINALIZED' && appointment.status === 'COMPLETED') return;
            if (encounter.status !== 'DRAFT' || appointment.status !== 'IN_PROGRESS') throw inconsistent();
          } else if (encounter.status === 'FINALIZED') {
            return;
          }

          if (encounter.version !== version) {
            throw new AppError('CLINICAL_ENCOUNTER_VERSION_CONFLICT',
              'Conflicto de versión. El encuentro ha sido modificado por otro proceso.', 409);
          }

          // Acquire write locks in the same entity order as startCare. A later
          // encounter/version/audit failure rolls back this appointment update too.
          if (appointment) {
            const result = await tx.appointment.updateMany({
              where: { id: appointment.id, clinicId, status: 'IN_PROGRESS',
                patientId: encounter.patientId, professionalMembershipId: membershipId },
              data: { status: 'COMPLETED', updatedByMembershipId: membershipId }
            });
            if (result.count !== 1) throw inconsistent();
          }

          const result = await tx.clinicalEncounter.updateMany({
            where: { id: encounterId, clinicId, status: 'DRAFT', version,
              professionalMembershipId: membershipId, appointmentId: encounter.appointmentId },
            data: { status: 'FINALIZED', finalizedAt: this.clock.now(), finalizedByMembershipId: membershipId,
              version: { increment: 1 }, updatedByMembershipId: membershipId }
          });
          if (result.count !== 1) {
            throw new AppError('CLINICAL_ENCOUNTER_VERSION_CONFLICT',
              'Conflicto de versión. El encuentro ha sido modificado por otro proceso.', 409);
          }

          await tx.auditEvent.create({ data: {
            clinicId, actorUserId: userId, action: 'CLINICAL_ENCOUNTER_FINALIZED',
            entityType: 'ClinicalEncounter', entityId: encounterId, success: true,
            metadata: { status: 'FINALIZED', previousStatus: 'DRAFT', version: version + 1 }
          } });
          if (appointment) {
            await tx.auditEvent.create({ data: {
              clinicId, actorUserId: userId, action: 'APPOINTMENT_STATUS_CHANGED',
              entityType: 'Appointment', entityId: appointment.id, success: true,
              metadata: { appointmentId: appointment.id, previousStatus: 'IN_PROGRESS', newStatus: 'COMPLETED' }
            } });
          }
        }, { isolationLevel: 'Serializable' });
        return;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) {
          throw new AppError('CONCURRENCY_ERROR',
            'No se pudo finalizar el encuentro debido a alta concurrencia. Intente de nuevo.', 409);
        }
      }
    }
  }

  // expectedPatientId is only for the legacy creation endpoint, never start-care input.
  async startCare(actor: DentalCareActor, appointmentId: string, expectedPatientId?: string): Promise<StartCareResult> {
    const { clinicId, membershipId, userId, role } = actor;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.repository.$transaction(async (tx): Promise<StartCareResult> => {
          const appointment = await tx.appointment.findFirst({ where: { id: appointmentId, clinicId } });
          if (!appointment) throw new AppError('NOT_FOUND', 'Cita no encontrada.', 404);

          const clinic = await tx.clinic.findFirst({ where: { id: clinicId } });
          if (!clinic) throw new AppError('NOT_FOUND', 'Clínica no encontrada.', 404);
          if (clinic.status !== 'ACTIVE') throw new AppError('FORBIDDEN', 'La clínica no está activa.', 403);

          const membership = await tx.membership.findFirst({
            where: { id: membershipId, clinicId, userId }, include: { profile: true, user: true }
          });
          if (!membership || membership.status !== 'ACTIVE' || membership.user.status !== 'ACTIVE' ||
            !['OWNER', 'PROFESSIONAL'].includes(role) || membership.role !== role ||
            appointment.professionalMembershipId !== membershipId) {
            throw new AppError('FORBIDDEN', 'Solo el profesional asignado puede iniciar su atención.', 403);
          }
          if (!membership.profile?.active) {
            throw new AppError('PROFESSIONAL_PROFILE_REQUIRED', 'Se requiere un perfil profesional activo.', 403);
          }
          if (expectedPatientId !== undefined && appointment.patientId !== expectedPatientId) {
            throw new AppError('NOT_FOUND', 'La cita no pertenece a este paciente.', 404);
          }

          const encounter = await tx.clinicalEncounter.findFirst({
            where: { appointmentId, clinicId }, select: encounterSelect
          });
          if (appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') {
            throw new AppError('INVALID_APPOINTMENT_STATE', 'La cita cancelada o no asistida no puede iniciar atención.', 409);
          }
          const inconsistent = () => new AppError('CARE_STATE_INCONSISTENT', 'Los estados o vínculos de la cita y consulta son inconsistentes.', 409);
          if (encounter) {
            if (encounter.patientId !== appointment.patientId || encounter.professionalMembershipId !== membershipId) {
              throw inconsistent();
            }
            if ((appointment.status === 'IN_PROGRESS' && encounter.status === 'DRAFT') ||
              (appointment.status === 'COMPLETED' && encounter.status === 'FINALIZED')) {
              return { created: false, appointment: { id: appointment.id, status: appointment.status }, encounter };
            }
            throw inconsistent();
          }
          if (!['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(appointment.status)) throw inconsistent();

          const patient = await tx.patient.findFirst({ where: { id: appointment.patientId, clinicId } });
          if (!patient) throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
          if (patient.status !== 'ACTIVE') throw new AppError('PATIENT_INACTIVE', 'El paciente está inactivo.', 409);

          // Serializable + appointmentId UNIQUE arbitrate competing starts. Every retry
          // opens a new transaction; no recovery is attempted inside an aborted one.
          if (appointment.status !== 'IN_PROGRESS') {
            await tx.appointment.update({ where: { id: appointment.id, clinicId },
              data: { status: 'IN_PROGRESS', updatedByMembershipId: membershipId } });
          }
          const createdEncounter = await tx.clinicalEncounter.create({
            data: { clinicId, patientId: appointment.patientId, professionalMembershipId: membershipId,
              appointmentId, occurredAt: this.clock.now(), status: 'DRAFT', version: 1,
              createdByMembershipId: membershipId, updatedByMembershipId: membershipId },
            select: encounterSelect
          });
          await tx.auditEvent.create({ data: { clinicId, actorUserId: userId,
            action: 'CLINICAL_ENCOUNTER_CREATED', entityType: 'ClinicalEncounter', entityId: createdEncounter.id,
            success: true, metadata: { status: 'DRAFT', appointmentLinked: true } } });
          if (appointment.status !== 'IN_PROGRESS') {
            await tx.auditEvent.create({ data: { clinicId, actorUserId: userId,
              action: 'APPOINTMENT_STATUS_CHANGED', entityType: 'Appointment', entityId: appointment.id,
              success: true, metadata: { appointmentId, previousStatus: appointment.status, newStatus: 'IN_PROGRESS' } } });
          }
          return { created: true, appointment: { id: appointment.id, status: 'IN_PROGRESS' }, encounter: createdEncounter };
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
          (error.code !== 'P2034' && !isAppointmentUniqueConflict(error))) throw error;
        if (attempt === 2) throw new AppError('CONCURRENCY_ERROR', 'No se pudo iniciar la atención debido a alta concurrencia. Intente de nuevo.', 409);
      }
    }
    throw new AppError('CONCURRENCY_ERROR', 'No se pudo iniciar la atención.', 409);
  }
}
