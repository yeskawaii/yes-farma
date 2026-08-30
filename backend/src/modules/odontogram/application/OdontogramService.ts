import type { Prisma, DentalFinding, AuditEvent } from '../../../generated/prisma';
import { Prisma as PrismaNamespace } from '../../../generated/prisma';
import { AppError } from '../../../shared/errors/AppError';
import {
  CreateDentalFindingInput,
  ResolveDentalFindingInput,
  CancelDentalFindingInput
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

export type IPrismaTxOdontogram = {
  dentalFinding: {
    findMany(args: Prisma.DentalFindingFindManyArgs): Promise<any[]>;
    findFirst(args: Prisma.DentalFindingFindFirstArgs): Promise<any>;
    create(args: Prisma.DentalFindingCreateArgs): Promise<DentalFinding>;
    update(args: Prisma.DentalFindingUpdateArgs): Promise<DentalFinding>;
    updateMany(args: Prisma.DentalFindingUpdateManyArgs): Promise<{ count: number }>;
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

const INCOMPATIBLE_WITH_MISSING = [
  'CARIES',
  'RESTORATION',
  'FRACTURE',
  'ENDODONTIC_TREATMENT',
  'EXTRACTION_INDICATED'
] as const;

export class OdontogramService {
  constructor(private readonly prisma: IOdontogramRepository) {}

  private normalizeString(str?: string | null): string | null {
    if (str === undefined || str === null) return null;
    const clean = str.trim();
    return clean === '' ? null : clean;
  }

  private areSurfaceSetsEqual(surfacesA: string[], surfacesB: string[]): boolean {
    if (surfacesA.length !== surfacesB.length) return false;
    const sortedA = [...surfacesA].sort();
    const sortedB = [...surfacesB].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
  }

  private toIsoStringSafe(val?: any): string | null {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
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
  ) {
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

      const teethMap: Record<number, { toothNumber: number; toothName: string; activeFindings: DentalFindingItemDto[] }> = {};

      for (const finding of activeFindings) {
        if (!teethMap[finding.toothNumber]) {
          teethMap[finding.toothNumber] = {
            toothNumber: finding.toothNumber,
            toothName: FDI_TOOTH_NAMES[finding.toothNumber] || `Pieza ${finding.toothNumber}`,
            activeFindings: []
          };
        }
        const toothEntry = teethMap[finding.toothNumber]!;
        toothEntry.activeFindings.push(this.mapToFindingItemDto(finding));
      }

      return {
        patientId,
        summary: {
          totalActiveFindings,
          teethWithActiveFindings,
          missingTeethCount
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
  ) {
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

      const mappedList = allFindings.map((f) => this.mapToFindingItemDto(f));
      const activeFindings = mappedList.filter((f) => f.status === 'ACTIVE');
      const resolvedFindings = mappedList.filter((f) => f.status === 'RESOLVED');
      const cancelledFindings = mappedList.filter((f) => f.status === 'CANCELLED');

      return {
        patientId,
        toothNumber,
        toothName: FDI_TOOTH_NAMES[toothNumber] || `Pieza ${toothNumber}`,
        activeFindings,
        resolvedFindings,
        cancelledFindings,
        history: mappedList
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

          // Active duplicate detection & clinical incompatibility on same tooth
          const existingActive = await tx.dentalFinding.findMany({
            where: {
              clinicId,
              patientId,
              toothNumber: input.toothNumber,
              status: 'ACTIVE'
            }
          });

          // Incompatibilities with MISSING on active findings
          const hasActiveMissing = existingActive.some((f) => f.findingType === 'MISSING');
          if (hasActiveMissing && (INCOMPATIBLE_WITH_MISSING as readonly string[]).includes(input.findingType)) {
            throw new AppError(
              'DENTAL_FINDING_INCOMPATIBLE',
              `No se puede registrar un hallazgo de tipo ${input.findingType} en una pieza marcada como ausente (MISSING)`,
              409
            );
          }

          if (input.findingType === 'MISSING') {
            const hasIncompatible = existingActive.some((f) =>
              (INCOMPATIBLE_WITH_MISSING as readonly string[]).includes(f.findingType)
            );
            if (hasIncompatible) {
              throw new AppError(
                'DENTAL_FINDING_INCOMPATIBLE',
                'No se puede marcar la pieza como ausente (MISSING) mientras existan hallazgos activos incompatibles (caries, restauración, fractura, endodoncia o extracción indicada)',
                409
              );
            }
          }

          const isDuplicate = existingActive.some((existing) => {
            if (existing.findingType !== input.findingType) return false;
            return this.areSurfaceSetsEqual(existing.surfaces, input.surfaces);
          });

          if (isDuplicate) {
            throw new AppError(
              'DENTAL_FINDING_ALREADY_EXISTS',
              `Ya existe un hallazgo activo de tipo ${input.findingType} en la pieza ${input.toothNumber} con las mismas superficies`,
              409
            );
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
            // Controlled deterministic diagnosis
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
            // Controlled deterministic diagnosis
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
