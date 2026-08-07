import type { Prisma, ClinicalEncounter, AuditEvent, PrismaClient } from '../../../generated/prisma';
import { Prisma as PrismaNamespace } from '../../../generated/prisma';
import { AppError } from '../../../shared/errors/AppError';
import {
  CreateClinicalEncounterInput,
  ListClinicalEncountersInput,
  UpdateClinicalEncounterInput
} from '../domain/ClinicalEncounterSchema';

// Define the transaction client type safely
export type IPrismaTxEncounter = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface IClinicalEncounterRepository {
  clinicalEncounter: PrismaClient['clinicalEncounter'];
  clinicalVitalSigns: PrismaClient['clinicalVitalSigns'];
  clinicalDiagnosis: PrismaClient['clinicalDiagnosis'];
  clinicalProcedure: PrismaClient['clinicalProcedure'];
  patient: PrismaClient['patient'];
  membership: PrismaClient['membership'];
  appointment: PrismaClient['appointment'];
  auditEvent: PrismaClient['auditEvent'];
  $transaction<T>(callback: (tx: IPrismaTxEncounter) => Promise<T>, options?: { isolationLevel?: PrismaNamespace.TransactionIsolationLevel }): Promise<T>;
}

export class ClinicalEncounterService {
  constructor(private readonly prisma: IClinicalEncounterRepository) {}

  private formatDisplayName(firstName: string, lastName: string, secondLastName?: string | null): string {
    const parts = [firstName, lastName];
    if (secondLastName) parts.push(secondLastName);
    return parts.join(' ');
  }

  async createEncounter(clinicId: string, membershipId: string, actorUserId: string, actorRole: string, input: CreateClinicalEncounterInput) {
    if (actorRole === 'ASSISTANT') {
      throw new AppError('FORBIDDEN', 'Rol no autorizado para crear encuentros clínicos', 403);
    }

    const { patientId, appointmentId, occurredAt } = input;
    const occurredAtDate = new Date(occurredAt);

    const executeTx = async () => {
      return await this.prisma.$transaction(async (tx) => {
        // Validate Patient
        const patient = await tx.patient.findFirst({
          where: { id: patientId, clinicId }
        });
        if (!patient) {
          throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
        }
        if (patient.status !== 'ACTIVE') {
          throw new AppError('PATIENT_INACTIVE', 'El paciente está inactivo.', 409);
        }

        // Validate Professional
        const profMembership = await tx.membership.findFirst({
          where: { id: membershipId, clinicId },
          select: { id: true, status: true }
        });
        if (!profMembership || profMembership.status !== 'ACTIVE') {
          throw new AppError('NOT_FOUND', 'Profesional no encontrado.', 404);
        }

        // Validate Appointment if provided
        if (appointmentId) {
          const appointment = await tx.appointment.findFirst({
            where: { id: appointmentId, clinicId },
            select: { id: true, patientId: true, professionalMembershipId: true, status: true }
          });

          if (!appointment) {
            throw new AppError('NOT_FOUND', 'Cita no encontrada.', 404);
          }
          if (appointment.patientId !== patientId) {
            throw new AppError('NOT_FOUND', 'La cita no pertenece a este paciente.', 404);
          }
          if (appointment.professionalMembershipId !== membershipId) {
            throw new AppError('NOT_FOUND', 'La cita no pertenece a este profesional.', 404);
          }
          if (appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW' || appointment.status === 'COMPLETED') {
            throw new AppError('INVALID_APPOINTMENT_STATE', `La cita en estado ${appointment.status} no puede iniciar un encuentro.`, 409);
          }

          // Update appointment status to IN_PROGRESS if SCHEDULED or CONFIRMED
          if (appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED') {
            await tx.appointment.update({
              where: { id: appointmentId },
              data: {
                status: 'IN_PROGRESS',
                updatedByMembershipId: membershipId
              }
            });
          }
        }

        // Create Encounter
        const encounter = await tx.clinicalEncounter.create({
          data: {
            clinicId,
            patientId,
            professionalMembershipId: membershipId,
            appointmentId: appointmentId || null,
            occurredAt: occurredAtDate,
            status: 'DRAFT',
            version: 1,
            createdByMembershipId: membershipId,
            updatedByMembershipId: membershipId,
          },
          select: {
            id: true,
            occurredAt: true,
            status: true,
            version: true,
            createdAt: true,
            updatedAt: true,
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
                user: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            },
            appointment: {
              select: {
                id: true,
                startAt: true,
                endAt: true,
                status: true
              }
            }
          }
        });

        // Audit Event
        await tx.auditEvent.create({
          data: {
            clinicId,
            actorUserId,
            action: 'CLINICAL_ENCOUNTER_CREATED',
            entityType: 'ClinicalEncounter',
            entityId: encounter.id,
            success: true,
            metadata: {
              status: 'DRAFT',
              appointmentLinked: !!appointmentId
            }
          }
        });

        return encounter;
      }, { isolationLevel: 'Serializable' });
    };

    let attempts = 0;
    while (attempts < 3) {
      try {
        const encounter = await executeTx();

        return {
          id: encounter.id,
          occurredAt: encounter.occurredAt,
          status: encounter.status,
          version: encounter.version,
          patient: {
            id: encounter.patient.id,
            displayName: this.formatDisplayName(encounter.patient.firstName, encounter.patient.lastName, encounter.patient.secondLastName)
          },
          professional: {
            id: encounter.professional.id,
            displayName: this.formatDisplayName(encounter.professional.user.firstName, encounter.professional.user.lastName)
          },
          appointment: encounter.appointment ? {
            id: encounter.appointment.id,
            startAt: encounter.appointment.startAt,
            endAt: encounter.appointment.endAt,
            status: encounter.appointment.status
          } : null,
          createdAt: encounter.createdAt,
          updatedAt: encounter.updatedAt
        };

      } catch (error: unknown) {
        if (error instanceof PrismaNamespace.PrismaClientKnownRequestError) {
          if (error.code === 'P2034') {
            attempts++;
            if (attempts >= 3) {
              throw new AppError('CONCURRENCY_ERROR', 'No se pudo crear el encuentro debido a alta concurrencia. Intente de nuevo.', 409);
            }
          } else if (error.code === 'P2002' && typeof error.meta?.target === 'object' && Array.isArray(error.meta.target) && error.meta.target.includes('appointmentId')) {
             throw new AppError('APPOINTMENT_ALREADY_HAS_ENCOUNTER', 'La cita ya está vinculada a un encuentro clínico.', 409);
          } else if (error.code === 'P2002' && typeof error.meta?.target === 'string' && error.meta.target.includes('appointmentId')) {
             throw new AppError('APPOINTMENT_ALREADY_HAS_ENCOUNTER', 'La cita ya está vinculada a un encuentro clínico.', 409);
          } else {
             throw error;
          }
        } else {
          throw error;
        }
      }
    }
    throw new AppError('CONCURRENCY_ERROR', 'No se pudo crear el encuentro debido a alta concurrencia.', 409);
  }

  async listEncounters(clinicId: string, actorRole: string, input: ListClinicalEncountersInput) {
    const { patientId, page, pageSize } = input;
    const skip = (page - 1) * pageSize;

    // Validate Patient
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId }
    });

    if (!patient) {
      throw new AppError('NOT_FOUND', 'Paciente no encontrado', 404);
    }

    const items = await this.prisma.clinicalEncounter.findMany({
      where: {
        clinicId,
        patientId
      },
      orderBy: [
        { occurredAt: 'desc' },
        { createdAt: 'desc' }
      ],
      skip,
      take: pageSize,
      select: {
        id: true,
        occurredAt: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        professional: {
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        },
        appointment: {
          select: {
            startAt: true,
            endAt: true,
            status: true
          }
        }
      }
    });

    return items.map((encounter) => {
      const adminProjection = {
        id: encounter.id,
        occurredAt: encounter.occurredAt,
        status: encounter.status,
        professional: {
          displayName: this.formatDisplayName(encounter.professional.user.firstName, encounter.professional.user.lastName)
        },
        appointment: encounter.appointment ? {
          startAt: encounter.appointment.startAt,
          status: encounter.appointment.status
        } : null,
        createdAt: encounter.createdAt
      };

      if (actorRole === 'ASSISTANT') {
        return adminProjection;
      }

      // OWNER and PROFESSIONAL
      return {
        ...adminProjection,
        version: encounter.version,
        appointment: encounter.appointment ? {
          startAt: encounter.appointment.startAt,
          endAt: encounter.appointment.endAt,
          status: encounter.appointment.status
        } : null,
        updatedAt: encounter.updatedAt
      };
    });
  }

  async getEncounterById(clinicId: string, id: string, actorRole: string) {
    if (actorRole === 'ASSISTANT') {
      throw new AppError('FORBIDDEN', 'No tienes permisos para consultar expedientes clínicos.', 403);
    }

    const encounter = await this.prisma.clinicalEncounter.findFirst({
      where: { id, clinicId },
      select: {
        id: true,
        occurredAt: true,
        status: true,
        version: true,
        reasonForVisit: true,
        relevantHistory: true,
        allergies: true,
        currentMedications: true,
        physicalExamination: true,
        indications: true,
        clinicalNotes: true,
        createdAt: true,
        updatedAt: true,
        finalizedAt: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            secondLastName: true,
            birthDate: true,
            sexAtBirth: true
          }
        },
        professional: {
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        },
        finalizedBy: {
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        },
        appointment: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            status: true
          }
        },
        vitalSigns: {
          select: {
            systolicBloodPressure: true,
            diastolicBloodPressure: true,
            heartRate: true,
            respiratoryRate: true,
            temperatureCelsius: true,
            oxygenSaturationPercent: true,
            weightKg: true,
            heightCm: true,
            measuredAt: true
          }
        },
        diagnoses: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            description: true,
            code: true,
            isPrimary: true,
            sortOrder: true,
            createdAt: true
          }
        },
        procedures: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            description: true,
            code: true,
            notes: true,
            sortOrder: true,
            createdAt: true
          }
        },
        amendments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            reason: true,
            note: true,
            createdAt: true,
            createdBy: {
              select: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!encounter) {
      throw new AppError('NOT_FOUND', 'Encuentro no encontrado', 404);
    }

    return {
      id: encounter.id,
      occurredAt: encounter.occurredAt,
      status: encounter.status,
      version: encounter.version,
      reasonForVisit: encounter.reasonForVisit,
      relevantHistory: encounter.relevantHistory,
      allergies: encounter.allergies,
      currentMedications: encounter.currentMedications,
      physicalExamination: encounter.physicalExamination,
      indications: encounter.indications,
      clinicalNotes: encounter.clinicalNotes,
      createdAt: encounter.createdAt,
      updatedAt: encounter.updatedAt,
      finalizedAt: encounter.finalizedAt,
      patient: {
        id: encounter.patient.id,
        displayName: this.formatDisplayName(encounter.patient.firstName, encounter.patient.lastName, encounter.patient.secondLastName),
        birthDate: encounter.patient.birthDate,
        sexAtBirth: encounter.patient.sexAtBirth
      },
      professional: {
        displayName: this.formatDisplayName(encounter.professional.user.firstName, encounter.professional.user.lastName)
      },
      finalizedBy: encounter.finalizedBy ? {
        displayName: this.formatDisplayName(encounter.finalizedBy.user.firstName, encounter.finalizedBy.user.lastName)
      } : null,
      appointment: encounter.appointment ? {
        id: encounter.appointment.id,
        startAt: encounter.appointment.startAt,
        endAt: encounter.appointment.endAt,
        status: encounter.appointment.status
      } : null,
      vitalSigns: encounter.vitalSigns ? {
        systolicBloodPressure: encounter.vitalSigns.systolicBloodPressure,
        diastolicBloodPressure: encounter.vitalSigns.diastolicBloodPressure,
        heartRate: encounter.vitalSigns.heartRate,
        respiratoryRate: encounter.vitalSigns.respiratoryRate,
        temperatureCelsius: encounter.vitalSigns.temperatureCelsius,
        oxygenSaturationPercent: encounter.vitalSigns.oxygenSaturationPercent,
        weightKg: encounter.vitalSigns.weightKg,
        heightCm: encounter.vitalSigns.heightCm,
        measuredAt: encounter.vitalSigns.measuredAt
      } : null,
      diagnoses: encounter.diagnoses.map((d) => ({
        id: d.id,
        description: d.description,
        code: d.code,
        isPrimary: d.isPrimary,
        sortOrder: d.sortOrder,
        createdAt: d.createdAt
      })),
      procedures: encounter.procedures.map((p) => ({
        id: p.id,
        description: p.description,
        code: p.code,
        notes: p.notes,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt
      })),
      amendments: encounter.amendments.map((a) => ({
        id: a.id,
        reason: a.reason,
        note: a.note,
        createdAt: a.createdAt,
        author: {
          displayName: this.formatDisplayName(a.createdBy.user.firstName, a.createdBy.user.lastName)
        }
      }))
    };
  }

  async updateEncounter(
    clinicId: string,
    id: string,
    membershipId: string,
    actorUserId: string,
    actorRole: string,
    input: UpdateClinicalEncounterInput
  ) {
    if (
      actorRole !== 'OWNER' &&
      actorRole !== 'PROFESSIONAL'
    ) {
      throw new AppError(
        'FORBIDDEN',
        'Rol no autorizado para editar encuentros clínicos',
        403
      );
    }

    const {
      version,
      occurredAt,
      vitalSigns,
      diagnoses,
      procedures,
      ...narrativeFields
    } = input;

    const executeTransaction = async (): Promise<void> => {
      await this.prisma.$transaction(
        async (tx) => {
          const encounter =
            await tx.clinicalEncounter.findFirst({
              where: {
                id,
                clinicId
              },
              select: {
                id: true,
                status: true,
                version: true,
                professionalMembershipId: true,
                occurredAt: true
              }
            });

          if (!encounter) {
            throw new AppError(
              'NOT_FOUND',
              'Encuentro no encontrado.',
              404
            );
          }

          if (encounter.status === 'FINALIZED') {
            throw new AppError(
              'CLINICAL_ENCOUNTER_FINALIZED',
              'El encuentro ya está finalizado.',
              409
            );
          }

          if (
            encounter.professionalMembershipId !==
            membershipId
          ) {
            throw new AppError(
              'FORBIDDEN',
              'Solo el profesional responsable puede editar este encuentro.',
              403
            );
          }

          if (encounter.version !== version) {
            throw new AppError(
              'CLINICAL_ENCOUNTER_VERSION_CONFLICT',
              'Conflicto de versión. El encuentro ha sido modificado por otro proceso.',
              409
            );
          }

          const updateData:
            PrismaNamespace.ClinicalEncounterUncheckedUpdateManyInput = {
              version: {
                increment: 1
              },
              updatedByMembershipId: membershipId,

              ...(occurredAt !== undefined
                ? {
                    occurredAt: new Date(occurredAt)
                  }
                : {}),

              ...(narrativeFields.reasonForVisit !== undefined
                ? {
                    reasonForVisit:
                      narrativeFields.reasonForVisit
                  }
                : {}),

              ...(narrativeFields.relevantHistory !== undefined
                ? {
                    relevantHistory:
                      narrativeFields.relevantHistory
                  }
                : {}),

              ...(narrativeFields.allergies !== undefined
                ? {
                    allergies: narrativeFields.allergies
                  }
                : {}),

              ...(narrativeFields.currentMedications !== undefined
                ? {
                    currentMedications:
                      narrativeFields.currentMedications
                  }
                : {}),

              ...(narrativeFields.physicalExamination !== undefined
                ? {
                    physicalExamination:
                      narrativeFields.physicalExamination
                  }
                : {}),

              ...(narrativeFields.indications !== undefined
                ? {
                    indications:
                      narrativeFields.indications
                  }
                : {}),

              ...(narrativeFields.clinicalNotes !== undefined
                ? {
                    clinicalNotes:
                      narrativeFields.clinicalNotes
                  }
                : {})
            };

          const fieldsChanged: string[] = [];

          if (occurredAt !== undefined) {
            fieldsChanged.push('occurredAt');
          }

          if (narrativeFields.reasonForVisit !== undefined) {
            fieldsChanged.push('reasonForVisit');
          }

          if (narrativeFields.relevantHistory !== undefined) {
            fieldsChanged.push('relevantHistory');
          }

          if (narrativeFields.allergies !== undefined) {
            fieldsChanged.push('allergies');
          }

          if (
            narrativeFields.currentMedications !==
            undefined
          ) {
            fieldsChanged.push('currentMedications');
          }

          if (
            narrativeFields.physicalExamination !==
            undefined
          ) {
            fieldsChanged.push('physicalExamination');
          }

          if (narrativeFields.indications !== undefined) {
            fieldsChanged.push('indications');
          }

          if (narrativeFields.clinicalNotes !== undefined) {
            fieldsChanged.push('clinicalNotes');
          }

          const updateResult =
            await tx.clinicalEncounter.updateMany({
              where: {
                id,
                clinicId,
                status: 'DRAFT',
                professionalMembershipId: membershipId,
                version
              },
              data: updateData
            });

          if (updateResult.count === 0) {
            throw new AppError(
              'CLINICAL_ENCOUNTER_VERSION_CONFLICT',
              'Conflicto de versión. El encuentro ha sido modificado por otro proceso.',
              409
            );
          }

          if (vitalSigns !== undefined) {
            fieldsChanged.push('vitalSigns');

            if (vitalSigns === null) {
              await tx.clinicalVitalSigns.deleteMany({
                where: {
                  clinicId,
                  encounterId: id
                }
              });
            } else {
              const existingVitalSigns =
                await tx.clinicalVitalSigns.findUnique({
                  where: {
                    clinicId_encounterId: {
                      clinicId,
                      encounterId: id
                    }
                  },
                  select: {
                    measuredAt: true
                  }
                });

              const measuredAt =
                vitalSigns.measuredAt !== undefined
                  ? new Date(vitalSigns.measuredAt)
                  : (
                      existingVitalSigns?.measuredAt ??
                      (
                        occurredAt !== undefined
                          ? new Date(occurredAt)
                          : encounter.occurredAt
                      )
                    );

              const vitalSignsData = {
                systolicBloodPressure:
                  vitalSigns.systolicBloodPressure ?? null,
                diastolicBloodPressure:
                  vitalSigns.diastolicBloodPressure ?? null,
                heartRate:
                  vitalSigns.heartRate ?? null,
                respiratoryRate:
                  vitalSigns.respiratoryRate ?? null,
                temperatureCelsius:
                  vitalSigns.temperatureCelsius ?? null,
                oxygenSaturationPercent:
                  vitalSigns.oxygenSaturationPercent ?? null,
                weightKg:
                  vitalSigns.weightKg ?? null,
                heightCm:
                  vitalSigns.heightCm ?? null,
                measuredAt
              };

              await tx.clinicalVitalSigns.upsert({
                where: {
                  clinicId_encounterId: {
                    clinicId,
                    encounterId: id
                  }
                },
                create: {
                  clinicId,
                  encounterId: id,
                  ...vitalSignsData
                },
                update: vitalSignsData
              });
            }
          }

          if (diagnoses !== undefined) {
            fieldsChanged.push('diagnoses');

            await tx.clinicalDiagnosis.deleteMany({
              where: {
                clinicId,
                encounterId: id
              }
            });

            if (diagnoses.length > 0) {
              await tx.clinicalDiagnosis.createMany({
                data: diagnoses.map(
                  (diagnosis, index) => ({
                    clinicId,
                    encounterId: id,
                    description: diagnosis.description,
                    code: diagnosis.code ?? null,
                    isPrimary: diagnosis.isPrimary,
                    sortOrder:
                      diagnosis.sortOrder ?? index
                  })
                )
              });
            }
          }

          if (procedures !== undefined) {
            fieldsChanged.push('procedures');

            await tx.clinicalProcedure.deleteMany({
              where: {
                clinicId,
                encounterId: id
              }
            });

            if (procedures.length > 0) {
              await tx.clinicalProcedure.createMany({
                data: procedures.map(
                  (procedure, index) => ({
                    clinicId,
                    encounterId: id,
                    description: procedure.description,
                    code: procedure.code ?? null,
                    notes: procedure.notes ?? null,
                    sortOrder:
                      procedure.sortOrder ?? index
                  })
                )
              });
            }
          }

          const [
            vitalSignsCount,
            diagnosisCount,
            procedureCount
          ] = await Promise.all([
            tx.clinicalVitalSigns.count({
              where: {
                clinicId,
                encounterId: id
              }
            }),
            tx.clinicalDiagnosis.count({
              where: {
                clinicId,
                encounterId: id
              }
            }),
            tx.clinicalProcedure.count({
              where: {
                clinicId,
                encounterId: id
              }
            })
          ]);

          await tx.auditEvent.create({
            data: {
              clinicId,
              actorUserId,
              action: 'CLINICAL_ENCOUNTER_UPDATED',
              entityType: 'ClinicalEncounter',
              entityId: id,
              success: true,
              metadata: {
                status: 'DRAFT',
                fieldsChanged,
                hasVitalSigns: vitalSignsCount > 0,
                diagnosisCount,
                procedureCount
              }
            }
          });
        },
        {
          isolationLevel: 'Serializable'
        }
      );
    };

    let attempts = 0;

    while (attempts < 3) {
      try {
        await executeTransaction();

        return await this.getEncounterById(
          clinicId,
          id,
          actorRole
        );
      } catch (error: unknown) {
        if (
          error instanceof
            PrismaNamespace.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          attempts += 1;

          if (attempts >= 3) {
            throw new AppError(
              'CONCURRENCY_ERROR',
              'No se pudo actualizar el encuentro debido a alta concurrencia. Intente de nuevo.',
              409
            );
          }

          continue;
        }

        throw error;
      }
    }

    throw new AppError(
      'CONCURRENCY_ERROR',
      'No se pudo actualizar el encuentro debido a alta concurrencia.',
      409
    );
  }

  async finalizeEncounter(
    clinicId: string,
    id: string,
    membershipId: string,
    actorUserId: string,
    actorRole: string,
    version: number
  ) {
    if (actorRole !== 'OWNER' && actorRole !== 'PROFESSIONAL') {
      throw new AppError(
        'FORBIDDEN',
        'Rol no autorizado para finalizar encuentros clínicos',
        403
      );
    }

    const executeTransaction = async (): Promise<void> => {
      await this.prisma.$transaction(
        async (tx) => {
          const encounter = await tx.clinicalEncounter.findFirst({
            where: {
              id,
              clinicId
            },
            select: {
              id: true,
              status: true,
              version: true,
              professionalMembershipId: true
            }
          });

          if (!encounter) {
            throw new AppError(
              'NOT_FOUND',
              'Encuentro no encontrado.',
              404
            );
          }

          if (encounter.status === 'FINALIZED') {
            throw new AppError(
              'CLINICAL_ENCOUNTER_FINALIZED',
              'El encuentro ya está finalizado.',
              409
            );
          }

          if (encounter.professionalMembershipId !== membershipId) {
            throw new AppError(
              'FORBIDDEN',
              'Solo el profesional responsable puede finalizar este encuentro.',
              403
            );
          }

          if (encounter.version !== version) {
            throw new AppError(
              'CLINICAL_ENCOUNTER_VERSION_CONFLICT',
              'Conflicto de versión. El encuentro ha sido modificado por otro proceso.',
              409
            );
          }

          const updateResult = await tx.clinicalEncounter.updateMany({
            where: {
              id,
              clinicId,
              status: 'DRAFT',
              professionalMembershipId: membershipId,
              version
            },
            data: {
              status: 'FINALIZED',
              finalizedAt: new Date(),
              finalizedByMembershipId: membershipId,
              version: {
                increment: 1
              },
              updatedByMembershipId: membershipId
            }
          });

          if (updateResult.count === 0) {
            throw new AppError(
              'CLINICAL_ENCOUNTER_VERSION_CONFLICT',
              'Conflicto de versión. El encuentro ha sido modificado por otro proceso.',
              409
            );
          }

          await tx.auditEvent.create({
            data: {
              clinicId,
              actorUserId,
              action: 'CLINICAL_ENCOUNTER_FINALIZED',
              entityType: 'ClinicalEncounter',
              entityId: id,
              success: true,
              metadata: {
                status: 'FINALIZED',
                previousStatus: 'DRAFT',
                version: version + 1
              }
            }
          });
        },
        {
          isolationLevel: 'Serializable'
        }
      );
    };

    let attempts = 0;

    while (attempts < 3) {
      try {
        await executeTransaction();

        return await this.getEncounterById(
          clinicId,
          id,
          actorRole
        );
      } catch (error: unknown) {
        if (
          error instanceof
            PrismaNamespace.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          attempts += 1;

          if (attempts >= 3) {
            throw new AppError(
              'CONCURRENCY_ERROR',
              'No se pudo finalizar el encuentro debido a alta concurrencia. Intente de nuevo.',
              409
            );
          }

          continue;
        }

        throw error;
      }
    }

    throw new AppError(
      'CONCURRENCY_ERROR',
      'No se pudo finalizar el encuentro debido a alta concurrencia.',
      409
    );
  }
}
