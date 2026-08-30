import type { Prisma, DentalFinding, ToothAssessment, AuditEvent, OdontogramBatchRequest } from '../../../generated/prisma';
import { Prisma as PrismaNamespace } from '../../../generated/prisma';
import { AppError } from '../../../shared/errors/AppError';
import {
  CreateDentalFindingInput,
  ResolveDentalFindingInput,
  CancelDentalFindingInput,
  BatchOdontogramActionInput,
  BatchFindingItemInput,
  BatchAssessmentItemInput,
  INCOMPATIBLE_WITH_HEALTHY,
  evaluateActiveFindingConflicts,
  evaluateActiveAssessmentConflicts,
  computeOdontogramBatchFingerprint
} from '../domain/OdontogramSchema';
import { isValidPermanentFdiTooth, FDI_TOOTH_NAMES } from '../domain/fdiConstants';

export interface DentalFindingItemDto {
  id: string;
  toothNumber: number;
  findingType: string;
  surfaces: string[];
  status: string;
  version: number;
  notes: string | null;
  encounterId: string | null;
  resolutionEncounterId: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    role: string;
    name: string;
  };
  resolvedBy: {
    id: string;
    role: string;
    name: string;
  } | null;
  cancelledBy: {
    id: string;
    role: string;
    name: string;
  } | null;
}

export interface ToothAssessmentItemDto {
  id: string;
  toothNumber: number;
  assessmentType: string;
  notes: string | null;
  encounterId: string | null;
  assessedAt: string;
  createdAt: string;
  assessedBy: {
    id: string;
    role: string;
    name: string;
  };
}

export interface BatchOdontogramResponseDto {
  patientId: string;
  appliedCount: number;
  action: 'CREATE_FINDING' | 'RECORD_ASSESSMENT';
  findings: DentalFindingItemDto[];
  assessments: ToothAssessmentItemDto[];
}

export interface OdontogramToothSummaryEntryDto {
  toothNumber: number;
  toothName: string;
  activeFindings: DentalFindingItemDto[];
  currentlyHealthy: boolean;
  latestHealthyAssessedAt: string | null;
}

export interface OdontogramSummaryDto {
  totalActiveFindings: number;
  teethWithActiveFindings: number;
  missingTeethCount: number;
  healthyTeethCount: number;
}

export interface OdontogramResponseDto {
  patientId: string;
  summary: OdontogramSummaryDto;
  teeth: Record<number, OdontogramToothSummaryEntryDto>;
}

export interface ToothDetailResponseDto {
  patientId: string;
  toothNumber: number;
  toothName: string;
  currentlyHealthy: boolean;
  activeFindings: DentalFindingItemDto[];
  resolvedFindings: DentalFindingItemDto[];
  cancelledFindings: DentalFindingItemDto[];
  history: DentalFindingItemDto[];
  assessments: ToothAssessmentItemDto[];
}

export type IPrismaTxOdontogram = {
  dentalFinding: {
    findMany(args: Prisma.DentalFindingFindManyArgs): Promise<any[]>;
    findFirst(args: Prisma.DentalFindingFindFirstArgs): Promise<any>;
    create(args: Prisma.DentalFindingCreateArgs): Promise<DentalFinding>;
    update(args: Prisma.DentalFindingUpdateArgs): Promise<DentalFinding>;
    updateMany(args: Prisma.DentalFindingUpdateManyArgs): Promise<{ count: number }>;
  };
  toothAssessment: {
    findMany(args: Prisma.ToothAssessmentFindManyArgs): Promise<any[]>;
    findFirst(args: Prisma.ToothAssessmentFindFirstArgs): Promise<any>;
    create(args: Prisma.ToothAssessmentCreateArgs): Promise<ToothAssessment>;
  };
  odontogramBatchRequest: {
    findFirst(args: Prisma.OdontogramBatchRequestFindFirstArgs): Promise<any>;
    create(args: Prisma.OdontogramBatchRequestCreateArgs): Promise<OdontogramBatchRequest>;
  };
  patient: {
    findFirst(args: Prisma.PatientFindFirstArgs): Promise<any>;
  };
  membership: {
    findFirst(args: Prisma.MembershipFindFirstArgs): Promise<any>;
  };
  clinicalEncounter: {
    findFirst(args: Prisma.ClinicalEncounterFindFirstArgs): Promise<any>;
  };
  auditEvent: {
    create(args: Prisma.AuditEventCreateArgs): Promise<AuditEvent>;
  };
};

export interface IOdontogramRepository {
  dentalFinding: {
    findMany(args: Prisma.DentalFindingFindManyArgs): Promise<any[]>;
    findFirst(args: Prisma.DentalFindingFindFirstArgs): Promise<any>;
    updateMany?(args: Prisma.DentalFindingUpdateManyArgs): Promise<{ count: number }>;
  };
  toothAssessment?: {
    findMany(args: Prisma.ToothAssessmentFindManyArgs): Promise<any[]>;
    findFirst(args: Prisma.ToothAssessmentFindFirstArgs): Promise<any>;
  };
  odontogramBatchRequest?: {
    findFirst(args: Prisma.OdontogramBatchRequestFindFirstArgs): Promise<any>;
    create(args: Prisma.OdontogramBatchRequestCreateArgs): Promise<any>;
  };
  patient: {
    findFirst(args: Prisma.PatientFindFirstArgs): Promise<any>;
  };
  membership: {
    findFirst(args: Prisma.MembershipFindFirstArgs): Promise<any>;
  };
  clinicalEncounter: {
    findFirst(args: Prisma.ClinicalEncounterFindFirstArgs): Promise<any>;
  };
  $transaction<T>(
    callback: (tx: IPrismaTxOdontogram) => Promise<T>,
    options?: { isolationLevel?: PrismaNamespace.TransactionIsolationLevel }
  ): Promise<T>;
}

export class OdontogramService {
  constructor(private readonly prisma: IOdontogramRepository) {}

  private normalizeString(str?: string | null): string | null {
    if (str === undefined || str === null) return null;
    const clean = str.trim();
    return clean === '' ? null : clean;
  }

  private toIsoStringSafe(val?: any): string | null {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  private toIsoStringStrict(val: Date | string | null | undefined, fieldName: string): string {
    if (!val) {
      throw new AppError('INTERNAL_ERROR', `El campo requerido ${fieldName} no está presente en la entidad`, 500);
    }
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) {
      throw new AppError('INTERNAL_ERROR', `El campo requerido ${fieldName} contiene una fecha inválida`, 500);
    }
    return d.toISOString();
  }

  private mapToFindingItemDto(finding: any): DentalFindingItemDto {
    const nowIso = new Date().toISOString();
    return {
      id: finding.id,
      toothNumber: finding.toothNumber,
      findingType: finding.findingType,
      surfaces: finding.surfaces || [],
      status: finding.status,
      version: finding.version ?? 1,
      notes: finding.notes ?? null,
      encounterId: finding.encounterId ?? null,
      resolutionEncounterId: finding.resolutionEncounterId ?? null,
      resolutionNotes: finding.resolutionNotes ?? null,
      resolvedAt: this.toIsoStringSafe(finding.resolvedAt),
      cancellationReason: finding.cancellationReason ?? null,
      cancelledAt: this.toIsoStringSafe(finding.cancelledAt),
      createdAt: this.toIsoStringSafe(finding.createdAt) || nowIso,
      updatedAt: this.toIsoStringSafe(finding.updatedAt) || nowIso,
      createdBy: {
        id: finding.createdBy?.id || 'unknown',
        role: finding.createdBy?.role || 'PROFESSIONAL',
        name: finding.createdBy?.user
          ? `${finding.createdBy.user.firstName || ''} ${finding.createdBy.user.lastName || ''}`.trim()
          : (finding.createdBy?.name || 'Profesional')
      },
      resolvedBy: finding.resolvedBy
        ? {
            id: finding.resolvedBy.id,
            role: finding.resolvedBy.role,
            name: finding.resolvedBy.user
              ? `${finding.resolvedBy.user.firstName || ''} ${finding.resolvedBy.user.lastName || ''}`.trim()
              : (finding.resolvedBy.name || 'Profesional')
          }
        : null,
      cancelledBy: finding.cancelledBy
        ? {
            id: finding.cancelledBy.id,
            role: finding.cancelledBy.role,
            name: finding.cancelledBy.user
              ? `${finding.cancelledBy.user.firstName || ''} ${finding.cancelledBy.user.lastName || ''}`.trim()
              : (finding.cancelledBy.name || 'Profesional')
          }
        : null
    };
  }

  private mapToAssessmentItemDto(assessment: any): ToothAssessmentItemDto {
    if (!assessment.assessedBy || !assessment.assessedBy.id) {
      throw new AppError('INTERNAL_ERROR', 'Información del profesional evaluador no disponible', 500);
    }

    const professionalName = assessment.assessedBy.user
      ? `${assessment.assessedBy.user.firstName || ''} ${assessment.assessedBy.user.lastName || ''}`.trim()
      : (assessment.assessedBy.name || 'Profesional');

    return {
      id: assessment.id,
      toothNumber: assessment.toothNumber,
      assessmentType: assessment.assessmentType,
      notes: assessment.notes ?? null,
      encounterId: assessment.encounterId ?? null,
      assessedAt: this.toIsoStringStrict(assessment.assessedAt, 'assessedAt'),
      createdAt: this.toIsoStringStrict(assessment.createdAt, 'createdAt'),
      assessedBy: {
        id: assessment.assessedBy.id,
        role: assessment.assessedBy.role,
        name: professionalName
      }
    };
  }

  public calculateToothHealthyStatus(
    toothNumber: number,
    allToothFindings: any[],
    allToothAssessments: any[]
  ): {
    currentlyHealthy: boolean;
    latestHealthyAssessment: any | null;
  } {
    const healthyAssessments = allToothAssessments
      .filter((a) => a.toothNumber === toothNumber && a.assessmentType === 'HEALTHY')
      .sort((a, b) => new Date(b.assessedAt).getTime() - new Date(a.assessedAt).getTime());

    const latestHealthy = healthyAssessments[0] || null;
    if (!latestHealthy) {
      return { currentlyHealthy: false, latestHealthyAssessment: null };
    }

    const latestHealthyTime = new Date(latestHealthy.assessedAt).getTime();

    // Rule B: No ACTIVE finding that is incompatible with HEALTHY
    const hasActiveIncompatible = allToothFindings.some(
      (f) =>
        f.toothNumber === toothNumber &&
        f.status === 'ACTIVE' &&
        (INCOMPATIBLE_WITH_HEALTHY as readonly string[]).includes(f.findingType)
    );

    // Rule C: No non-CANCELLED finding created AFTER latestHealthyTime that is incompatible with HEALTHY
    const hasSubsequentIncompatible = allToothFindings.some(
      (f) =>
        f.toothNumber === toothNumber &&
        f.status !== 'CANCELLED' &&
        (INCOMPATIBLE_WITH_HEALTHY as readonly string[]).includes(f.findingType) &&
        new Date(f.createdAt).getTime() > latestHealthyTime
    );

    const currentlyHealthy = !hasActiveIncompatible && !hasSubsequentIncompatible;

    return {
      currentlyHealthy,
      latestHealthyAssessment: latestHealthy
    };
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, errorMessage: string): Promise<T> {
    let attempts = 0;

    while (attempts < 3) {
      try {
        return await operation();
      } catch (error: unknown) {
        if (
          error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          attempts += 1;

          if (attempts >= 3) {
            throw new AppError(
              'CONCURRENCY_ERROR',
              `${errorMessage} debido a alta concurrencia. Intente de nuevo.`,
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
      `${errorMessage} debido a alta concurrencia.`,
      409
    );
  }

  private async validateProfessionalCapacity(
    tx: IPrismaTxOdontogram,
    clinicId: string,
    membershipId: string
  ) {
    const membership = await tx.membership.findFirst({
      where: { id: membershipId, clinicId },
      include: {
        profile: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new AppError('NOT_FOUND', 'Membresía no encontrada o inactiva', 404);
    }

    if (membership.role === 'ASSISTANT') {
      throw new AppError('FORBIDDEN', 'Rol de asistente no autorizado para acceder al odontograma clínico', 403);
    }

    if (membership.role !== 'OWNER' && membership.role !== 'PROFESSIONAL') {
      throw new AppError('FORBIDDEN', 'Rol no autorizado para acceder al odontograma clínico', 403);
    }

    if (!membership.profile || membership.profile.active !== true) {
      throw new AppError(
        'FORBIDDEN',
        'Se requiere un perfil profesional activo para acceder o modificar información clínica dental',
        403
      );
    }

    return membership;
  }

  async getOdontogram(
    clinicId: string,
    patientId: string,
    membershipId: string
  ): Promise<OdontogramResponseDto> {
    return await this.prisma.$transaction(async (tx) => {
      await this.validateProfessionalCapacity(tx, clinicId, membershipId);

      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId },
        select: { id: true, status: true }
      });

      if (!patient) {
        throw new AppError('NOT_FOUND', 'Paciente no encontrado', 404);
      }

      const activeFindings = await tx.dentalFinding.findMany({
        where: {
          clinicId,
          patientId,
          status: 'ACTIVE'
        },
        include: {
          createdBy: {
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
        },
        orderBy: [{ toothNumber: 'asc' }, { createdAt: 'asc' }]
      });

      const allFindings = await tx.dentalFinding.findMany({
        where: {
          clinicId,
          patientId
        }
      });

      const allAssessments = tx.toothAssessment
        ? await tx.toothAssessment.findMany({
            where: {
              clinicId,
              patientId
            },
            include: {
              assessedBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              }
            },
            orderBy: { assessedAt: 'desc' }
          })
        : [];

      const totalActiveFindings = activeFindings.length;
      const teethWithFindingsSet = new Set<number>();
      const missingTeethSet = new Set<number>();

      for (const finding of activeFindings) {
        teethWithFindingsSet.add(finding.toothNumber);
        if (finding.findingType === 'MISSING') {
          missingTeethSet.add(finding.toothNumber);
        }
      }

      const teethWithActiveFindings = teethWithFindingsSet.size;
      const missingTeethCount = missingTeethSet.size;

      const teethMap: Record<number, OdontogramToothSummaryEntryDto> = {};
      let healthyTeethCount = 0;

      // Check all 32 permanent teeth for findings and health status
      const allToothNumbers = new Set<number>([
        ...activeFindings.map((f) => f.toothNumber),
        ...allAssessments.map((a) => a.toothNumber)
      ]);

      for (const toothNumber of allToothNumbers) {
        const findingsForTooth = allFindings.filter((f) => f.toothNumber === toothNumber);
        const assessmentsForTooth = allAssessments.filter((a) => a.toothNumber === toothNumber);
        const activeForTooth = activeFindings.filter((f) => f.toothNumber === toothNumber);

        const { currentlyHealthy, latestHealthyAssessment } = this.calculateToothHealthyStatus(
          toothNumber,
          findingsForTooth,
          assessmentsForTooth
        );

        if (currentlyHealthy) {
          healthyTeethCount += 1;
        }

        teethMap[toothNumber] = {
          toothNumber,
          toothName: FDI_TOOTH_NAMES[toothNumber] || `Pieza ${toothNumber}`,
          activeFindings: activeForTooth.map((f) => this.mapToFindingItemDto(f)),
          currentlyHealthy,
          latestHealthyAssessedAt: latestHealthyAssessment
            ? this.toIsoStringStrict(latestHealthyAssessment.assessedAt, 'assessedAt')
            : null
        };
      }

      return {
        patientId,
        summary: {
          totalActiveFindings,
          teethWithActiveFindings,
          missingTeethCount,
          healthyTeethCount
        },
        teeth: teethMap
      };
    });
  }

  async getToothDetail(
    clinicId: string,
    patientId: string,
    toothNumber: number,
    membershipId: string
  ): Promise<ToothDetailResponseDto> {
    if (!isValidPermanentFdiTooth(toothNumber)) {
      throw new AppError('VALIDATION_ERROR', `Número de diente FDI inválido: ${toothNumber}`, 400);
    }

    return await this.prisma.$transaction(async (tx) => {
      await this.validateProfessionalCapacity(tx, clinicId, membershipId);

      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId }
      });
      if (!patient) {
        throw new AppError('NOT_FOUND', 'Paciente no encontrado', 404);
      }

      const allFindings = await tx.dentalFinding.findMany({
        where: {
          clinicId,
          patientId,
          toothNumber
        },
        include: {
          createdBy: {
            select: {
              id: true,
              role: true,
              user: { select: { firstName: true, lastName: true } }
            }
          },
          resolvedBy: {
            select: {
              id: true,
              role: true,
              user: { select: { firstName: true, lastName: true } }
            }
          },
          cancelledBy: {
            select: {
              id: true,
              role: true,
              user: { select: { firstName: true, lastName: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const allAssessments = tx.toothAssessment
        ? await tx.toothAssessment.findMany({
            where: {
              clinicId,
              patientId,
              toothNumber
            },
            include: {
              assessedBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              }
            },
            orderBy: { assessedAt: 'desc' }
          })
        : [];

      const mappedList = allFindings.map((f) => this.mapToFindingItemDto(f));
      const activeFindings = mappedList.filter((f) => f.status === 'ACTIVE');
      const resolvedFindings = mappedList.filter((f) => f.status === 'RESOLVED');
      const cancelledFindings = mappedList.filter((f) => f.status === 'CANCELLED');

      const { currentlyHealthy } = this.calculateToothHealthyStatus(
        toothNumber,
        allFindings,
        allAssessments
      );

      return {
        patientId,
        toothNumber,
        toothName: FDI_TOOTH_NAMES[toothNumber] || `Pieza ${toothNumber}`,
        currentlyHealthy,
        activeFindings,
        resolvedFindings,
        cancelledFindings,
        history: mappedList,
        assessments: allAssessments.map((a) => this.mapToAssessmentItemDto(a))
      };
    });
  }

  async createFinding(
    clinicId: string,
    patientId: string,
    membershipId: string,
    input: CreateDentalFindingInput
  ): Promise<DentalFindingItemDto> {
    const cleanNotes = this.normalizeString(input.notes);
    const cleanEncounterId = input.encounterId ?? null;

    const executeTx = async () => {
      return await this.prisma.$transaction(
        async (tx) => {
          const membership = await this.validateProfessionalCapacity(tx, clinicId, membershipId);

          const patient = await tx.patient.findFirst({
            where: { id: patientId, clinicId }
          });
          if (!patient) {
            throw new AppError('NOT_FOUND', 'Paciente no encontrado', 404);
          }
          if (patient.status !== 'ACTIVE') {
            throw new AppError('PATIENT_INACTIVE', 'El paciente está inactivo.', 409);
          }

          if (cleanEncounterId) {
            const encounter = await tx.clinicalEncounter.findFirst({
              where: {
                id: cleanEncounterId,
                clinicId,
                patientId
              },
              select: { id: true, professionalMembershipId: true }
            });
            if (!encounter) {
              throw new AppError('NOT_FOUND', 'Consulta clínica no encontrada o no pertenece a este paciente', 404);
            }
            if (encounter.professionalMembershipId !== membership.id) {
              throw new AppError('FORBIDDEN', 'No puedes asociar un hallazgo dental a una consulta clínica de otro profesional', 403);
            }
          }

          // Active duplicate detection & clinical incompatibility using shared domain helper
          const existingActive = await tx.dentalFinding.findMany({
            where: {
              clinicId,
              patientId,
              toothNumber: input.toothNumber,
              status: 'ACTIVE'
            }
          });

          const conflict = evaluateActiveFindingConflicts(
            input.toothNumber,
            input.findingType,
            input.surfaces,
            existingActive
          );

          if (conflict) {
            throw new AppError(conflict.conflictCode, conflict.message, 409);
          }

          const created = await tx.dentalFinding.create({
            data: {
              clinicId,
              patientId,
              toothNumber: input.toothNumber,
              findingType: input.findingType,
              surfaces: input.surfaces,
              status: 'ACTIVE',
              version: 1,
              notes: cleanNotes,
              encounterId: cleanEncounterId,
              createdByMembershipId: membership.id,
              updatedByMembershipId: membership.id
            }
          });

          // AuditEvent without PHI or clinical values, strictly technical
          await tx.auditEvent.create({
            data: {
              clinicId,
              actorUserId: membership.userId,
              action: 'DENTAL_FINDING_CREATED',
              entityType: 'DentalFinding',
              entityId: created.id,
              success: true,
              metadata: {
                previousStatus: null,
                newStatus: 'ACTIVE',
                previousVersion: null,
                newVersion: 1,
                fieldsChanged: [
                  'status',
                  'version',
                  'findingType',
                  'toothNumber',
                  'surfaces',
                  ...(cleanEncounterId ? ['encounterId'] : []),
                  ...(cleanNotes ? ['notes'] : [])
                ]
              }
            }
          });

          const createdWithRelations = await tx.dentalFinding.findFirst({
            where: { id: created.id, clinicId, patientId },
            include: {
              createdBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              },
              resolvedBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              },
              cancelledBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              }
            }
          });

          return this.mapToFindingItemDto(
            createdWithRelations || {
              ...created,
              createdBy: membership,
              resolvedBy: null,
              cancelledBy: null
            }
          );
        },
        {
          isolationLevel: 'Serializable'
        }
      );
    };

    return await this.executeWithRetry(executeTx, 'No se pudo crear el hallazgo dental');
  }

  private isOdontogramBatchRequestUniqueViolation(error: unknown): boolean {
    if (!(error instanceof PrismaNamespace.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    const target = (error.meta as { target?: unknown } | undefined)?.target;
    if (!target) return false;

    const constraintName = 'OdontogramBatchRequest_clinicId_patientId_requestId_key';

    if (typeof target === 'string') {
      return target === constraintName || target.includes(constraintName);
    }

    if (Array.isArray(target)) {
      const stringTargets = target.map(String);
      if (stringTargets.includes(constraintName)) {
        return true;
      }
      const hasRequestId = stringTargets.includes('requestId');
      const hasClinicId = stringTargets.includes('clinicId');
      const hasPatientId = stringTargets.includes('patientId');
      return hasClinicId && hasPatientId && hasRequestId;
    }

    return false;
  }

  async applyBatch(
    clinicId: string,
    patientId: string,
    membershipId: string,
    input: BatchOdontogramActionInput
  ): Promise<BatchOdontogramResponseDto> {
    const cleanNotes = this.normalizeString(input.notes);
    const cleanEncounterId = input.encounterId ?? null;
    const computedFingerprint = computeOdontogramBatchFingerprint(input);

    const executeTx = async () => {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const membership = await this.validateProfessionalCapacity(tx, clinicId, membershipId);

            const patient = await tx.patient.findFirst({
              where: { id: patientId, clinicId }
            });
            if (!patient) {
              throw new AppError('NOT_FOUND', 'Paciente no encontrado', 404);
            }
            if (patient.status !== 'ACTIVE') {
              throw new AppError('PATIENT_INACTIVE', 'El paciente está inactivo.', 409);
            }

            if (cleanEncounterId) {
              const encounter = await tx.clinicalEncounter.findFirst({
                where: {
                  id: cleanEncounterId,
                  clinicId,
                  patientId
                },
                select: { id: true, professionalMembershipId: true }
              });
              if (!encounter) {
                throw new AppError('NOT_FOUND', 'Consulta clínica no encontrada o no pertenece a este paciente', 404);
              }
              if (encounter.professionalMembershipId !== membership.id) {
                throw new AppError('FORBIDDEN', 'No puedes asociar un hallazgo dental a una consulta clínica de otro profesional', 403);
              }
            }

            // Check existing OdontogramBatchRequest in ledger
            if (tx.odontogramBatchRequest) {
              const existingBatchRequest = await tx.odontogramBatchRequest.findFirst({
                where: {
                  clinicId,
                  patientId,
                  requestId: input.requestId
                }
              });

              if (existingBatchRequest) {
                if (existingBatchRequest.requestFingerprint !== computedFingerprint) {
                  throw new AppError(
                    'IDEMPOTENCY_KEY_REUSED',
                    'El requestId proporcionado ya fue utilizado para una operación con contenido diferente.',
                    409
                  );
                }

                // Legitimate retry: return previous results without new writes or audit event
                if (input.action === 'CREATE_FINDING') {
                  const existingFindings = await tx.dentalFinding.findMany({
                    where: {
                      clinicId,
                      patientId,
                      sourceRequestId: input.requestId
                    },
                    include: {
                      createdBy: {
                        select: {
                          id: true,
                          role: true,
                          user: { select: { firstName: true, lastName: true } }
                        }
                      },
                      resolvedBy: {
                        select: {
                          id: true,
                          role: true,
                          user: { select: { firstName: true, lastName: true } }
                        }
                      },
                      cancelledBy: {
                        select: {
                          id: true,
                          role: true,
                          user: { select: { firstName: true, lastName: true } }
                        }
                      }
                    }
                  });

                  return {
                    patientId,
                    appliedCount: existingFindings.length,
                    action: 'CREATE_FINDING' as const,
                    findings: existingFindings.map((f) => this.mapToFindingItemDto(f)),
                    assessments: []
                  };
                } else {
                  if (tx.toothAssessment) {
                    const existingAssessments = await tx.toothAssessment.findMany({
                      where: {
                        clinicId,
                        patientId,
                        sourceRequestId: input.requestId
                      },
                      include: {
                        assessedBy: {
                          select: {
                            id: true,
                            role: true,
                            user: { select: { firstName: true, lastName: true } }
                          }
                        }
                      }
                    });

                    return {
                      patientId,
                      appliedCount: existingAssessments.length,
                      action: 'RECORD_ASSESSMENT' as const,
                      findings: [],
                      assessments: existingAssessments.map((a) => this.mapToAssessmentItemDto(a))
                    };
                  }
                }
              }
            }

            // Bulk read active findings and assessments on involved teeth
            const toothNumbers = input.items.map((i: BatchFindingItemInput | BatchAssessmentItemInput) => i.toothNumber);

            const activeFindingsOnTeeth = await tx.dentalFinding.findMany({
              where: {
                clinicId,
                patientId,
                toothNumber: { in: toothNumbers },
                status: 'ACTIVE'
              }
            });

            const existingEncounterAssessments =
              input.action === 'RECORD_ASSESSMENT' && cleanEncounterId && tx.toothAssessment
                ? await tx.toothAssessment.findMany({
                    where: {
                      clinicId,
                      patientId,
                      toothNumber: { in: toothNumbers },
                      encounterId: cleanEncounterId
                    }
                  })
                : [];

            const failures: Array<{
              index: number;
              toothNumber: number;
              reasonCode: string;
              reasonMessage: string;
            }> = [];

            if (input.action === 'CREATE_FINDING') {
              const findingType = input.findingType;

              input.items.forEach((item: BatchFindingItemInput, index: number) => {
                const activeOnTooth = activeFindingsOnTeeth.filter((f) => f.toothNumber === item.toothNumber);

                const conflict = evaluateActiveFindingConflicts(
                  item.toothNumber,
                  findingType,
                  item.surfaces,
                  activeOnTooth
                );

                if (conflict) {
                  failures.push({
                    index,
                    toothNumber: item.toothNumber,
                    reasonCode: conflict.conflictCode,
                    reasonMessage: conflict.message
                  });
                }
              });
            } else {
              // RECORD_ASSESSMENT (HEALTHY)
              input.items.forEach((item: BatchAssessmentItemInput, index: number) => {
                const activeOnTooth = activeFindingsOnTeeth.filter((f) => f.toothNumber === item.toothNumber);

                const conflict = evaluateActiveAssessmentConflicts(
                  item.toothNumber,
                  input.assessmentType,
                  activeOnTooth
                );

                if (conflict) {
                  failures.push({
                    index,
                    toothNumber: item.toothNumber,
                    reasonCode: conflict.conflictCode,
                    reasonMessage: conflict.message
                  });
                  return;
                }

                // Duplicate Assessment in same encounter
                if (cleanEncounterId) {
                  const alreadyAssessedInEncounter = existingEncounterAssessments.some(
                    (a) => a.toothNumber === item.toothNumber
                  );
                  if (alreadyAssessedInEncounter) {
                    failures.push({
                      index,
                      toothNumber: item.toothNumber,
                      reasonCode: 'TOOTH_ASSESSMENT_ALREADY_EXISTS',
                      reasonMessage: `La pieza ${item.toothNumber} ya fue evaluada en esta consulta clínica`
                    });
                    return;
                  }
                }
              });
            }

            // Atomic validation: If any failure exists, reject all without writing anything
            if (failures.length > 0) {
              throw new AppError(
                'BATCH_VALIDATION_FAILED',
                'Uno o más elementos del lote no cumplen las reglas clínicas o de duplicidad.',
                409,
                { failures }
              );
            }

            // Reserve ledger record
            if (tx.odontogramBatchRequest) {
              await tx.odontogramBatchRequest.create({
                data: {
                  clinicId,
                  patientId,
                  requestId: input.requestId,
                  requestFingerprint: computedFingerprint,
                  action: input.action,
                  createdByMembershipId: membership.id
                }
              });
            }

            // Write-all phase
            if (input.action === 'CREATE_FINDING') {
              const createdFindings: any[] = [];

              for (const item of input.items) {
                const created = await tx.dentalFinding.create({
                  data: {
                    clinicId,
                    patientId,
                    toothNumber: item.toothNumber,
                    findingType: input.findingType,
                    surfaces: item.surfaces,
                    status: 'ACTIVE',
                    version: 1,
                    notes: cleanNotes,
                    encounterId: cleanEncounterId,
                    sourceRequestId: input.requestId,
                    createdByMembershipId: membership.id,
                    updatedByMembershipId: membership.id
                  },
                  include: {
                    createdBy: {
                      select: {
                        id: true,
                        role: true,
                        user: { select: { firstName: true, lastName: true } }
                      }
                    }
                  }
                });

                createdFindings.push(created);
              }

              // Technical AuditEvent without PHI or fingerprint
              await tx.auditEvent.create({
                data: {
                  clinicId,
                  actorUserId: membership.userId,
                  action: 'DENTAL_ODONTOGRAM_BATCH_CREATED',
                  entityType: 'DentalFinding',
                  entityId: createdFindings[0]?.id || null,
                  success: true,
                  metadata: {
                    actionType: 'CREATE_FINDING',
                    itemCount: createdFindings.length,
                    hasEncounter: Boolean(cleanEncounterId),
                    createdEntityIds: createdFindings.map((f) => f.id)
                  }
                }
              });

              return {
                patientId,
                appliedCount: createdFindings.length,
                action: 'CREATE_FINDING' as const,
                findings: createdFindings.map((f) => this.mapToFindingItemDto(f)),
                assessments: []
              };
            } else {
              const createdAssessments: any[] = [];

              for (const item of input.items) {
                const created = await tx.toothAssessment.create({
                  data: {
                    clinicId,
                    patientId,
                    toothNumber: item.toothNumber,
                    assessmentType: input.assessmentType,
                    notes: cleanNotes,
                    encounterId: cleanEncounterId,
                    sourceRequestId: input.requestId,
                    assessedByMembershipId: membership.id
                  },
                  include: {
                    assessedBy: {
                      select: {
                        id: true,
                        role: true,
                        user: { select: { firstName: true, lastName: true } }
                      }
                    }
                  }
                });

                createdAssessments.push(created);
              }

              // Technical AuditEvent without PHI or fingerprint
              await tx.auditEvent.create({
                data: {
                  clinicId,
                  actorUserId: membership.userId,
                  action: 'DENTAL_ODONTOGRAM_BATCH_CREATED',
                  entityType: 'ToothAssessment',
                  entityId: createdAssessments[0]?.id || null,
                  success: true,
                  metadata: {
                    actionType: 'RECORD_ASSESSMENT',
                    itemCount: createdAssessments.length,
                    hasEncounter: Boolean(cleanEncounterId),
                    createdEntityIds: createdAssessments.map((a) => a.id)
                  }
                }
              });

              return {
                patientId,
                appliedCount: createdAssessments.length,
                action: 'RECORD_ASSESSMENT' as const,
                findings: [],
                assessments: createdAssessments.map((a) => this.mapToAssessmentItemDto(a))
              };
            }
          },
          {
            isolationLevel: 'Serializable'
          }
        );
      } catch (error: unknown) {
        // Handle race condition strictly on UNIQUE constraint of OdontogramBatchRequest
        if (this.isOdontogramBatchRequestUniqueViolation(error)) {
          if (this.prisma.odontogramBatchRequest) {
            const recordedBatch = await this.prisma.odontogramBatchRequest.findFirst({
              where: {
                clinicId,
                patientId,
                requestId: input.requestId
              }
            });

            if (recordedBatch) {
              if (recordedBatch.requestFingerprint !== computedFingerprint) {
                throw new AppError(
                  'IDEMPOTENCY_KEY_REUSED',
                  'El requestId proporcionado ya fue utilizado para una operación con contenido diferente.',
                  409
                );
              }

              // Concurrent winner already wrote records: return them cleanly
              if (input.action === 'CREATE_FINDING') {
                const existingFindings = await this.prisma.dentalFinding.findMany({
                  where: { clinicId, patientId, sourceRequestId: input.requestId },
                  include: {
                    createdBy: { select: { id: true, role: true, user: { select: { firstName: true, lastName: true } } } },
                    resolvedBy: { select: { id: true, role: true, user: { select: { firstName: true, lastName: true } } } },
                    cancelledBy: { select: { id: true, role: true, user: { select: { firstName: true, lastName: true } } } }
                  }
                });
                return {
                  patientId,
                  appliedCount: existingFindings.length,
                  action: 'CREATE_FINDING' as const,
                  findings: existingFindings.map((f) => this.mapToFindingItemDto(f)),
                  assessments: []
                };
              } else {
                if (this.prisma.toothAssessment) {
                  const existingAssessments = await this.prisma.toothAssessment.findMany({
                    where: { clinicId, patientId, sourceRequestId: input.requestId },
                    include: {
                      assessedBy: { select: { id: true, role: true, user: { select: { firstName: true, lastName: true } } } }
                    }
                  });
                  return {
                    patientId,
                    appliedCount: existingAssessments.length,
                    action: 'RECORD_ASSESSMENT' as const,
                    findings: [],
                    assessments: existingAssessments.map((a) => this.mapToAssessmentItemDto(a))
                  };
                }
              }
            }
          }
        }

        throw error;
      }
    };

    return await this.executeWithRetry(executeTx, 'No se pudo procesar el lote de odontograma');
  }

  async resolveFinding(
    clinicId: string,
    patientId: string,
    findingId: string,
    membershipId: string,
    input: ResolveDentalFindingInput
  ): Promise<DentalFindingItemDto> {
    const cleanNotes = this.normalizeString(input.resolutionNotes);
    const cleanEncounterId = input.resolutionEncounterId ?? null;

    const executeTx = async () => {
      return await this.prisma.$transaction(
        async (tx) => {
          const membership = await this.validateProfessionalCapacity(tx, clinicId, membershipId);

          const patient = await tx.patient.findFirst({
            where: { id: patientId, clinicId }
          });
          if (!patient) {
            throw new AppError('NOT_FOUND', 'Paciente no encontrado', 404);
          }

          if (cleanEncounterId) {
            const encounter = await tx.clinicalEncounter.findFirst({
              where: {
                id: cleanEncounterId,
                clinicId,
                patientId
              },
              select: { id: true, professionalMembershipId: true }
            });
            if (!encounter) {
              throw new AppError('NOT_FOUND', 'Consulta clínica de resolución no encontrada o no pertenece a este paciente', 404);
            }
            if (encounter.professionalMembershipId !== membership.id) {
              throw new AppError('FORBIDDEN', 'No puedes asociar una resolución a una consulta clínica de otro profesional', 403);
            }
          }

          // Atomic optimistic locking update using updateMany
          const resolvedAt = new Date();
          const updateResult = await tx.dentalFinding.updateMany({
            where: {
              id: findingId,
              clinicId,
              patientId,
              status: 'ACTIVE',
              version: input.expectedVersion
            },
            data: {
              status: 'RESOLVED',
              resolvedAt,
              resolvedByMembershipId: membership.id,
              resolutionNotes: cleanNotes,
              resolutionEncounterId: cleanEncounterId,
              updatedByMembershipId: membership.id,
              version: { increment: 1 }
            }
          });

          if (updateResult.count === 0) {
            const existing = await tx.dentalFinding.findFirst({
              where: { id: findingId, clinicId, patientId }
            });

            if (!existing) {
              throw new AppError('NOT_FOUND', 'Hallazgo dental no encontrado', 404);
            }

            if (existing.status !== 'ACTIVE') {
              throw new AppError(
                'INVALID_STATUS_TRANSITION',
                `Solo pueden resolverse hallazgos en estado activo (estado actual: ${existing.status})`,
                409
              );
            }

            if (existing.version !== input.expectedVersion) {
              throw new AppError(
                'STALE_VERSION',
                'El hallazgo ha sido modificado por otro usuario. Recarga la información.',
                409
              );
            }

            throw new AppError('STALE_VERSION', 'Conflicto de concurrencia al resolver el hallazgo.', 409);
          }

          const updated = await tx.dentalFinding.findFirst({
            where: { id: findingId, clinicId, patientId },
            include: {
              createdBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              },
              resolvedBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              },
              cancelledBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              }
            }
          });

          // AuditEvent without PHI or clinical values
          await tx.auditEvent.create({
            data: {
              clinicId,
              actorUserId: membership.userId,
              action: 'DENTAL_FINDING_RESOLVED',
              entityType: 'DentalFinding',
              entityId: findingId,
              success: true,
              metadata: {
                previousStatus: 'ACTIVE',
                newStatus: 'RESOLVED',
                previousVersion: input.expectedVersion,
                newVersion: input.expectedVersion + 1,
                fieldsChanged: [
                  'status',
                  'resolvedAt',
                  'resolvedByMembershipId',
                  'version',
                  ...(cleanNotes ? ['resolutionNotes'] : []),
                  ...(cleanEncounterId ? ['resolutionEncounterId'] : [])
                ]
              }
            }
          });

          return this.mapToFindingItemDto(
            updated || {
              id: findingId,
              toothNumber: 11,
              findingType: 'OTHER',
              surfaces: [],
              status: 'RESOLVED',
              version: input.expectedVersion + 1,
              notes: null,
              encounterId: null,
              resolutionEncounterId: cleanEncounterId,
              resolutionNotes: cleanNotes,
              resolvedAt,
              cancellationReason: null,
              cancelledAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: membership,
              resolvedBy: membership,
              cancelledBy: null
            }
          );
        },
        {
          isolationLevel: 'Serializable'
        }
      );
    };

    return await this.executeWithRetry(executeTx, 'No se pudo resolver el hallazgo dental');
  }

  async cancelFinding(
    clinicId: string,
    patientId: string,
    findingId: string,
    membershipId: string,
    input: CancelDentalFindingInput
  ): Promise<DentalFindingItemDto> {
    const cleanReason = this.normalizeString(input.cancellationReason);
    if (!cleanReason) {
      throw new AppError('VALIDATION_ERROR', 'El motivo de cancelación es obligatorio', 400);
    }

    const executeTx = async () => {
      return await this.prisma.$transaction(
        async (tx) => {
          const membership = await this.validateProfessionalCapacity(tx, clinicId, membershipId);

          const patient = await tx.patient.findFirst({
            where: { id: patientId, clinicId }
          });
          if (!patient) {
            throw new AppError('NOT_FOUND', 'Paciente no encontrado', 404);
          }

          // Atomic optimistic locking update using updateMany
          const cancelledAt = new Date();
          const updateResult = await tx.dentalFinding.updateMany({
            where: {
              id: findingId,
              clinicId,
              patientId,
              status: 'ACTIVE',
              version: input.expectedVersion
            },
            data: {
              status: 'CANCELLED',
              cancelledAt,
              cancelledByMembershipId: membership.id,
              cancellationReason: cleanReason,
              updatedByMembershipId: membership.id,
              version: { increment: 1 }
            }
          });

          if (updateResult.count === 0) {
            const existing = await tx.dentalFinding.findFirst({
              where: { id: findingId, clinicId, patientId }
            });

            if (!existing) {
              throw new AppError('NOT_FOUND', 'Hallazgo dental no encontrado', 404);
            }

            if (existing.status !== 'ACTIVE') {
              throw new AppError(
                'INVALID_STATUS_TRANSITION',
                `Solo pueden cancelarse hallazgos en estado activo (estado actual: ${existing.status})`,
                409
              );
            }

            if (existing.version !== input.expectedVersion) {
              throw new AppError(
                'STALE_VERSION',
                'El hallazgo ha sido modificado por otro usuario. Recarga la información.',
                409
              );
            }

            throw new AppError('STALE_VERSION', 'Conflicto de concurrencia al cancelar el hallazgo.', 409);
          }

          const updated = await tx.dentalFinding.findFirst({
            where: { id: findingId, clinicId, patientId },
            include: {
              createdBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              },
              resolvedBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              },
              cancelledBy: {
                select: {
                  id: true,
                  role: true,
                  user: { select: { firstName: true, lastName: true } }
                }
              }
            }
          });

          // AuditEvent without PHI or clinical values
          await tx.auditEvent.create({
            data: {
              clinicId,
              actorUserId: membership.userId,
              action: 'DENTAL_FINDING_CANCELLED',
              entityType: 'DentalFinding',
              entityId: findingId,
              success: true,
              metadata: {
                previousStatus: 'ACTIVE',
                newStatus: 'CANCELLED',
                previousVersion: input.expectedVersion,
                newVersion: input.expectedVersion + 1,
                fieldsChanged: [
                  'status',
                  'cancelledAt',
                  'cancelledByMembershipId',
                  'cancellationReason',
                  'version'
                ]
              }
            }
          });

          return this.mapToFindingItemDto(
            updated || {
              id: findingId,
              toothNumber: 11,
              findingType: 'OTHER',
              surfaces: [],
              status: 'CANCELLED',
              version: input.expectedVersion + 1,
              notes: null,
              encounterId: null,
              resolutionEncounterId: null,
              resolutionNotes: null,
              resolvedAt: null,
              cancellationReason: cleanReason,
              cancelledAt,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: membership,
              resolvedBy: null,
              cancelledBy: membership
            }
          );
        },
        {
          isolationLevel: 'Serializable'
        }
      );
    };

    return await this.executeWithRetry(executeTx, 'No se pudo cancelar el hallazgo dental');
  }
}
