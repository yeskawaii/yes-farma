import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma as PrismaNamespace } from '../../generated/prisma';
import { OdontogramService } from './application/OdontogramService';
import { AppError } from '../../shared/errors/AppError';
import { errorHandler } from '../../shared/errors/errorHandler';
import {
  createDentalFindingSchema,
  resolveDentalFindingSchema,
  cancelDentalFindingSchema,
  batchOdontogramActionSchema,
  WHOLE_TOOTH_ONLY_FINDING_TYPES,
  SURFACE_ORIENTED_FINDING_TYPES,
  INCOMPATIBLE_WITH_HEALTHY,
  COMPATIBLE_WITH_HEALTHY,
  evaluateActiveFindingConflicts,
  evaluateActiveAssessmentConflicts,
  computeOdontogramBatchFingerprint
} from './domain/OdontogramSchema';

const createMockPrisma = (
  overrides: any = {},
  initialFindings: any[] = [],
  initialAssessments: any[] = [],
  initialBatchRequests: any[] = []
) => {
  let createdFindings: any[] = [...initialFindings];
  let newlyCreatedFindings: any[] = [];
  let createdAssessments: any[] = [...initialAssessments];
  let newlyCreatedAssessments: any[] = [];
  let createdBatchRequests: any[] = [...initialBatchRequests];
  let newlyCreatedBatchRequests: any[] = [];
  let updatedFindings: any[] = [];
  let updateManyCalls: any[] = [];
  let auditEvents: any[] = [];
  let lastTransactionOptions: any = null;

  const mock: any = {
    dentalFinding: {
      findMany: async (args?: any) => {
        let list = [...createdFindings];
        if (args?.where?.status) {
          list = list.filter((f) => f.status === args.where.status);
        }
        if (args?.where?.toothNumber !== undefined) {
          if (args.where.toothNumber.in) {
            list = list.filter((f) => args.where.toothNumber.in.includes(f.toothNumber));
          } else {
            list = list.filter((f) => f.toothNumber === args.where.toothNumber);
          }
        }
        if (args?.where?.sourceRequestId) {
          list = list.filter((f) => f.sourceRequestId === args.where.sourceRequestId);
        }
        return list;
      },
      findFirst: async (args?: any) => {
        if (args?.where?.id) {
          const created = createdFindings.find((f) => f.id === args.where.id);
          if (created) {
            return {
              ...created,
              createdBy: {
                id: created.createdByMembershipId || 'mem-prof',
                role: 'PROFESSIONAL',
                user: { firstName: 'Dra', lastName: 'Ana' }
              },
              resolvedBy: created.resolvedByMembershipId
                ? { id: created.resolvedByMembershipId, role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
                : null,
              cancelledBy: created.cancelledByMembershipId
                ? { id: created.cancelledByMembershipId, role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
                : null
            };
          }
        }
        return {
          id: args?.where?.id || 'finding-1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          toothNumber: 16,
          findingType: 'CARIES',
          surfaces: ['OCCLUSAL'],
          status: 'ACTIVE',
          version: 1,
          notes: null,
          encounterId: null,
          resolutionEncounterId: null,
          resolutionNotes: null,
          resolvedAt: null,
          cancellationReason: null,
          cancelledAt: null,
          createdAt: new Date('2026-08-29T12:00:00.000Z'),
          updatedAt: new Date('2026-08-29T12:00:00.000Z'),
          createdBy: {
            id: 'mem-prof',
            role: 'PROFESSIONAL',
            user: { firstName: 'Dra', lastName: 'Ana' }
          },
          resolvedBy: null,
          cancelledBy: null
        };
      },
      create: async (args: any) => {
        const item = {
          id: `finding-${Date.now()}-${Math.random()}`,
          ...args.data,
          version: 1,
          createdAt: new Date('2026-08-29T12:00:00.000Z'),
          updatedAt: new Date('2026-08-29T12:00:00.000Z'),
          createdBy: {
            id: 'mem-prof',
            role: 'PROFESSIONAL',
            user: { firstName: 'Dra', lastName: 'Ana' }
          },
          resolvedBy: null,
          cancelledBy: null
        };
        createdFindings.push(item);
        newlyCreatedFindings.push(item);
        return item;
      },
      update: async (args: any) => {
        const item = { id: args.where.id, ...args.data, updatedAt: new Date() };
        updatedFindings.push(item);
        return item;
      },
      updateMany: async (args: any) => {
        updateManyCalls.push(args);
        return { count: 1 };
      },
      ...(overrides.dentalFinding || {})
    },
    toothAssessment: {
      findMany: async (args?: any) => {
        let list = [...createdAssessments];
        if (args?.where?.toothNumber !== undefined) {
          if (args.where.toothNumber.in) {
            list = list.filter((a) => args.where.toothNumber.in.includes(a.toothNumber));
          } else {
            list = list.filter((a) => a.toothNumber === args.where.toothNumber);
          }
        }
        if (args?.where?.sourceRequestId) {
          list = list.filter((a) => a.sourceRequestId === args.where.sourceRequestId);
        }
        if (args?.where?.encounterId) {
          list = list.filter((a) => a.encounterId === args.where.encounterId);
        }
        return list;
      },
      findFirst: async () => {
        return createdAssessments[0] || null;
      },
      create: async (args: any) => {
        const item = {
          id: `assessment-${Date.now()}-${Math.random()}`,
          ...args.data,
          assessedAt: args.data.assessedAt || new Date('2026-08-30T12:00:00.000Z'),
          createdAt: args.data.createdAt || new Date('2026-08-30T12:00:00.000Z'),
          assessedBy: {
            id: args.data.assessedByMembershipId || 'mem-prof',
            role: 'PROFESSIONAL',
            user: { firstName: 'Dra', lastName: 'Ana' }
          }
        };
        createdAssessments.push(item);
        newlyCreatedAssessments.push(item);
        return item;
      },
      ...(overrides.toothAssessment || {})
    },
    odontogramBatchRequest: {
      findFirst: async (args?: any) => {
        let list = [...createdBatchRequests];
        if (args?.where?.requestId) {
          list = list.filter((r) => r.requestId === args.where.requestId);
        }
        if (args?.where?.clinicId) {
          list = list.filter((r) => r.clinicId === args.where.clinicId);
        }
        if (args?.where?.patientId) {
          list = list.filter((r) => r.patientId === args.where.patientId);
        }
        return list[0] || null;
      },
      create: async (args: any) => {
        const exists = createdBatchRequests.some(
          (r) =>
            r.clinicId === args.data.clinicId &&
            r.patientId === args.data.patientId &&
            r.requestId === args.data.requestId
        );
        if (exists) {
          throw new PrismaNamespace.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`clinicId`,`patientId`,`requestId`)',
            {
              code: 'P2002',
              clientVersion: '1',
              meta: { target: ['OdontogramBatchRequest_clinicId_patientId_requestId_key'] }
            }
          );
        }
        const item = {
          id: `batch-req-${Date.now()}-${Math.random()}`,
          ...args.data,
          createdAt: new Date()
        };
        createdBatchRequests.push(item);
        newlyCreatedBatchRequests.push(item);
        return item;
      },
      ...(overrides.odontogramBatchRequest || {})
    },
    patient: {
      findFirst: async () => ({ id: 'pat-1', clinicId: 'clinic-1', status: 'ACTIVE' }),
      ...(overrides.patient || {})
    },
    membership: {
      findFirst: async () => ({
        id: 'mem-prof',
        userId: 'user-prof-123',
        clinicId: 'clinic-1',
        status: 'ACTIVE',
        role: 'PROFESSIONAL',
        user: { id: 'user-prof-123', firstName: 'Dra', lastName: 'Ana' },
        profile: { active: true, specialtyCode: 'ODONT' }
      }),
      ...(overrides.membership || {})
    },
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', clinicId: 'clinic-1', patientId: 'pat-1', professionalMembershipId: 'mem-prof' }),
      ...(overrides.clinicalEncounter || {})
    },
    auditEvent: {
      create: async (args: any) => {
        auditEvents.push(args.data);
        return { id: `audit-${Date.now()}`, ...args.data };
      },
      ...(overrides.auditEvent || {})
    },
    $transaction: async (cb: any, options?: any) => {
      lastTransactionOptions = options;
      return cb(mock);
    },
    _getCreatedFindings: () => createdFindings,
    _getNewlyCreatedFindings: () => newlyCreatedFindings,
    _getCreatedAssessments: () => createdAssessments,
    _getNewlyCreatedAssessments: () => newlyCreatedAssessments,
    _getCreatedBatchRequests: () => createdBatchRequests,
    _getNewlyCreatedBatchRequests: () => newlyCreatedBatchRequests,
    _getUpdatedFindings: () => updatedFindings,
    _getUpdateManyCalls: () => updateManyCalls,
    _getAuditEvents: () => auditEvents,
    _getLastTransactionOptions: () => lastTransactionOptions
  };

  if (overrides.$transaction) {
    mock.$transaction = overrides.$transaction;
  }

  return mock;
};

test('Odontogram — Domain Schema & FDI Validations', async (t) => {
  await t.test('1. Permite registrar piezas permanentes FDI válidas (11..18, 21..28, 31..38, 41..48)', () => {
    const validTeeth = [11, 16, 21, 28, 31, 36, 41, 48];
    for (const toothNumber of validTeeth) {
      const isAnterior = [11, 21, 31, 41].includes(toothNumber);
      const surfaces = isAnterior ? ['VESTIBULAR', 'INCISAL'] : ['VESTIBULAR', 'OCCLUSAL'];
      const parsed = createDentalFindingSchema.safeParse({
        toothNumber,
        findingType: 'CARIES',
        surfaces
      });
      assert.ok(parsed.success, `Debe aceptar pieza FDI ${toothNumber}`);
    }
  });

  await t.test('2. Rechaza números FDI inválidos o temporales (ej. 19, 29, 51, 99, 0)', () => {
    const invalidTeeth = [0, 9, 10, 19, 20, 29, 30, 39, 40, 49, 51, 55, 61, 71, 81, 99];
    for (const toothNumber of invalidTeeth) {
      const parsed = createDentalFindingSchema.safeParse({
        toothNumber,
        findingType: 'CARIES',
        surfaces: ['VESTIBULAR']
      });
      assert.strictEqual(parsed.success, false, `Debe rechazar pieza inválida ${toothNumber}`);
    }
  });

  await t.test('3. Rechaza superficie OCCLUSAL en piezas anteriores (11..13, 21..23, 31..33, 41..43)', () => {
    const anteriorTeeth = [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43];
    for (const toothNumber of anteriorTeeth) {
      const parsed = createDentalFindingSchema.safeParse({
        toothNumber,
        findingType: 'CARIES',
        surfaces: ['MESIAL', 'OCCLUSAL']
      });
      assert.strictEqual(parsed.success, false, `Debe rechazar OCCLUSAL en diente anterior ${toothNumber}`);
    }
  });

  await t.test('4. Rechaza superficie INCISAL en piezas posteriores (14..18, 24..28, 34..38, 44..48)', () => {
    const posteriorTeeth = [14, 15, 16, 17, 18, 24, 25, 26, 27, 28, 34, 35, 36, 37, 38, 44, 45, 46, 47, 48];
    for (const toothNumber of posteriorTeeth) {
      const parsed = createDentalFindingSchema.safeParse({
        toothNumber,
        findingType: 'RESTORATION',
        surfaces: ['MESIAL', 'INCISAL']
      });
      assert.strictEqual(parsed.success, false, `Debe rechazar INCISAL en diente posterior ${toothNumber}`);
    }
  });

  await t.test('5. WHOLE_TOOTH es mutuamente excluyente con superficies individuales', () => {
    const validWhole = createDentalFindingSchema.safeParse({
      toothNumber: 16,
      findingType: 'CROWN',
      surfaces: ['WHOLE_TOOTH']
    });
    assert.ok(validWhole.success);

    const invalidMixed = createDentalFindingSchema.safeParse({
      toothNumber: 16,
      findingType: 'CROWN',
      surfaces: ['WHOLE_TOOTH', 'OCCLUSAL']
    });
    assert.strictEqual(invalidMixed.success, false);
  });

  await t.test('6. Tipos whole-tooth rechazan superficies individuales y exigen exactamente WHOLE_TOOTH', () => {
    const wholeToothTypes = [
      'CROWN',
      'ENDODONTIC_TREATMENT',
      'IMPLANT',
      'MISSING',
      'EXTRACTION_INDICATED',
      'PROSTHESIS'
    ];

    for (const findingType of wholeToothTypes) {
      // Rejection with individual surface
      const invalid = createDentalFindingSchema.safeParse({
        toothNumber: 16,
        findingType,
        surfaces: ['OCCLUSAL']
      });
      assert.strictEqual(invalid.success, false, `Debe rechazar ${findingType} con superficies individuales`);

      // Acceptance with WHOLE_TOOTH
      const valid = createDentalFindingSchema.safeParse({
        toothNumber: 16,
        findingType,
        surfaces: ['WHOLE_TOOTH']
      });
      assert.ok(valid.success, `Debe aceptar ${findingType} con WHOLE_TOOTH`);
    }
  });

  await t.test('7. Tipos surface-oriented (CARIES, RESTORATION, FRACTURE) aceptan superficies válidas y WHOLE_TOOTH', () => {
    for (const findingType of SURFACE_ORIENTED_FINDING_TYPES) {
      const validIndividual = createDentalFindingSchema.safeParse({
        toothNumber: 16,
        findingType,
        surfaces: ['VESTIBULAR', 'OCCLUSAL']
      });
      assert.ok(validIndividual.success, `Debe aceptar ${findingType} con superficies anatómicas`);

      const validWhole = createDentalFindingSchema.safeParse({
        toothNumber: 16,
        findingType,
        surfaces: ['WHOLE_TOOTH']
      });
      assert.ok(validWhole.success, `Debe aceptar ${findingType} con WHOLE_TOOTH`);
    }
  });

  await t.test('8. Tipo OTHER permanece flexible aceptando superficies anatómicas y WHOLE_TOOTH', () => {
    const validSurfaces = createDentalFindingSchema.safeParse({
      toothNumber: 16,
      findingType: 'OTHER',
      surfaces: ['MESIAL', 'DISTAL']
    });
    assert.ok(validSurfaces.success);

    const validWhole = createDentalFindingSchema.safeParse({
      toothNumber: 16,
      findingType: 'OTHER',
      surfaces: ['WHOLE_TOOTH']
    });
    assert.ok(validWhole.success);
  });
});

test('Odontogram — Clinical Incompatibilities on Active Findings (V1)', async (t) => {
  await t.test('1. MISSING activo rechaza registrar CARIES, RESTORATION, FRACTURE, ENDO, EXTRACTION (409 DENTAL_FINDING_INCOMPATIBLE)', async () => {
    const incompatibleTypes = [
      { type: 'CARIES', surfaces: ['OCCLUSAL'] },
      { type: 'RESTORATION', surfaces: ['MESIAL'] },
      { type: 'FRACTURE', surfaces: ['VESTIBULAR'] },
      { type: 'ENDODONTIC_TREATMENT', surfaces: ['WHOLE_TOOTH'] },
      { type: 'EXTRACTION_INDICATED', surfaces: ['WHOLE_TOOTH'] }
    ];

    for (const { type, surfaces } of incompatibleTypes) {
      const mock = createMockPrisma({
        dentalFinding: {
          findMany: async () => [
            {
              id: 'f-missing',
              clinicId: 'clinic-1',
              patientId: 'pat-1',
              toothNumber: 16,
              findingType: 'MISSING',
              surfaces: ['WHOLE_TOOTH'],
              status: 'ACTIVE'
            }
          ]
        }
      });
      const service = new OdontogramService(mock);

      await assert.rejects(
        service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
          toothNumber: 16,
          findingType: type as any,
          surfaces: surfaces as any
        }),
        (err: any) => err.code === 'DENTAL_FINDING_INCOMPATIBLE' && err.statusCode === 409,
        `Debe rechazar ${type} cuando MISSING está activo`
      );
    }
  });

  await t.test('2. Hallazgo activo natural (ej. CARIES, FRACTURE) rechaza registrar MISSING (409 DENTAL_FINDING_INCOMPATIBLE)', async () => {
    const activeTypes = ['CARIES', 'RESTORATION', 'FRACTURE', 'ENDODONTIC_TREATMENT', 'EXTRACTION_INDICATED'];

    for (const activeType of activeTypes) {
      const mock = createMockPrisma({
        dentalFinding: {
          findMany: async () => [
            {
              id: `f-${activeType}`,
              clinicId: 'clinic-1',
              patientId: 'pat-1',
              toothNumber: 16,
              findingType: activeType,
              surfaces: ['OCCLUSAL'],
              status: 'ACTIVE'
            }
          ]
        }
      });
      const service = new OdontogramService(mock);

      await assert.rejects(
        service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
          toothNumber: 16,
          findingType: 'MISSING',
          surfaces: ['WHOLE_TOOTH']
        }),
        (err: any) => err.code === 'DENTAL_FINDING_INCOMPATIBLE' && err.statusCode === 409,
        `Debe rechazar MISSING cuando ${activeType} está activo`
      );
    }
  });

  await t.test('3. MISSING activo permite coexistir con IMPLANT, PROSTHESIS, CROWN y OTHER', async () => {
    const allowedTypes = [
      { type: 'IMPLANT', surfaces: ['WHOLE_TOOTH'] },
      { type: 'PROSTHESIS', surfaces: ['WHOLE_TOOTH'] },
      { type: 'CROWN', surfaces: ['WHOLE_TOOTH'] },
      { type: 'OTHER', surfaces: ['WHOLE_TOOTH'] }
    ];

    for (const { type, surfaces } of allowedTypes) {
      const mock = createMockPrisma({
        dentalFinding: {
          findMany: async () => [
            {
              id: 'f-missing',
              clinicId: 'clinic-1',
              patientId: 'pat-1',
              toothNumber: 16,
              findingType: 'MISSING',
              surfaces: ['WHOLE_TOOTH'],
              status: 'ACTIVE'
            }
          ]
        }
      });
      const service = new OdontogramService(mock);

      const created = await service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
        toothNumber: 16,
        findingType: type as any,
        surfaces: surfaces as any
      });

      assert.ok(created);
      assert.strictEqual(created.findingType, type);
    }
  });

  await t.test('4. Incompatibilidades aplican únicamente sobre hallazgos ACTIVE (RESOLVED/CANCELLED no bloquean)', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        findMany: async (args?: any) => {
          if (args?.where?.status === 'ACTIVE') {
            return []; // No active findings
          }
          return [
            {
              id: 'f-past-missing',
              clinicId: 'clinic-1',
              patientId: 'pat-1',
              toothNumber: 16,
              findingType: 'MISSING',
              surfaces: ['WHOLE_TOOTH'],
              status: 'CANCELLED'
            }
          ];
        }
      }
    });
    const service = new OdontogramService(mock);

    const created = await service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
      toothNumber: 16,
      findingType: 'CARIES',
      surfaces: ['OCCLUSAL']
    });

    assert.ok(created);
    assert.strictEqual(created.findingType, 'CARIES');
  });
});

test('Odontogram — Authoritative DB Membership & Permissions', async (t) => {
  await t.test('1. ASSISTANT en BD es rechazado (403 Forbidden)', async () => {
    const mock = createMockPrisma({
      membership: {
        findFirst: async () => ({
          id: 'mem-ast',
          clinicId: 'clinic-1',
          status: 'ACTIVE',
          role: 'ASSISTANT',
          profile: null
        })
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.getOdontogram('clinic-1', 'pat-1', 'mem-ast'),
      (err: any) => err.code === 'FORBIDDEN' && err.statusCode === 403
    );
  });

  await t.test('2. OWNER sin perfil profesional activo en BD es rechazado (403 Forbidden)', async () => {
    const mock = createMockPrisma({
      membership: {
        findFirst: async () => ({
          id: 'mem-owner',
          clinicId: 'clinic-1',
          status: 'ACTIVE',
          role: 'OWNER',
          profile: null
        })
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.getOdontogram('clinic-1', 'pat-1', 'mem-owner'),
      (err: any) => err.code === 'FORBIDDEN' && err.statusCode === 403
    );
  });

  await t.test('3. PROFESSIONAL con perfil inactivo en BD es rechazado (403 Forbidden)', async () => {
    const mock = createMockPrisma({
      membership: {
        findFirst: async () => ({
          id: 'mem-prof-inactive',
          clinicId: 'clinic-1',
          status: 'ACTIVE',
          role: 'PROFESSIONAL',
          profile: { active: false, specialtyCode: 'ODONT' }
        })
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.createFinding('clinic-1', 'pat-1', 'mem-prof-inactive', {
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL']
      }),
      (err: any) => err.code === 'FORBIDDEN' && err.statusCode === 403
    );
  });

  await t.test('4. OWNER con perfil profesional activo en BD es admitido', async () => {
    const mock = createMockPrisma({
      membership: {
        findFirst: async () => ({
          id: 'mem-owner-doc',
          userId: 'user-owner-999',
          clinicId: 'clinic-1',
          status: 'ACTIVE',
          role: 'OWNER',
          user: { id: 'user-owner-999', firstName: 'Dr', lastName: 'Owner' },
          profile: { active: true, specialtyCode: 'ODONT' }
        })
      }
    });
    const service = new OdontogramService(mock);

    const finding = await service.createFinding('clinic-1', 'pat-1', 'mem-owner-doc', {
      toothNumber: 16,
      findingType: 'CARIES',
      surfaces: ['OCCLUSAL']
    });

    assert.ok(finding);
    assert.strictEqual(finding.toothNumber, 16);
  });

  await t.test('5. AuditEvent.actorUserId se obtiene autoritativamente desde Membership en BD', async () => {
    let capturedAudit: any;
    const mock = createMockPrisma({
      membership: {
        findFirst: async () => ({
          id: 'mem-prof-authoritative',
          userId: 'auth-user-777',
          clinicId: 'clinic-1',
          status: 'ACTIVE',
          role: 'PROFESSIONAL',
          user: { id: 'auth-user-777', firstName: 'Dra', lastName: 'Elena' },
          profile: { active: true, specialtyCode: 'ODONT' }
        })
      },
      auditEvent: {
        create: async (args: any) => {
          capturedAudit = args.data;
          return { id: 'a-1', ...args.data };
        }
      }
    });
    const service = new OdontogramService(mock);

    await service.createFinding('clinic-1', 'pat-1', 'mem-prof-authoritative', {
      toothNumber: 16,
      findingType: 'CARIES',
      surfaces: ['OCCLUSAL']
    });

    assert.ok(capturedAudit);
    assert.strictEqual(capturedAudit.actorUserId, 'auth-user-777');
  });
});

test('Odontogram — ClinicalEncounter Ownership', async (t) => {
  await t.test('1. createFinding rechaza asociar a un encounterId propiedad de otro profesional (403 Forbidden)', async () => {
    const mock = createMockPrisma({
      clinicalEncounter: {
        findFirst: async () => ({
          id: 'enc-other-prof',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          professionalMembershipId: 'mem-other-prof'
        })
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL'],
        encounterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      }),
      (err: any) => err.code === 'FORBIDDEN' && err.statusCode === 403
    );
  });

  await t.test('2. resolveFinding rechaza asociar a un resolutionEncounterId propiedad de otro profesional (403 Forbidden)', async () => {
    const mock = createMockPrisma({
      clinicalEncounter: {
        findFirst: async () => ({
          id: 'enc-other-prof',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          professionalMembershipId: 'mem-other-prof'
        })
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.resolveFinding('clinic-1', 'pat-1', 'f-1', 'mem-prof', {
        expectedVersion: 1,
        resolutionEncounterId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
      }),
      (err: any) => err.code === 'FORBIDDEN' && err.statusCode === 403
    );
  });
});

test('Odontogram — Serializable Transactions & P2034 Retries', async (t) => {
  await t.test('1. Mutaciones ejecutan $transaction con isolationLevel: Serializable', async () => {
    let capturedOptions: any = null;
    const mock = createMockPrisma({
      $transaction: async (cb: any, options: any) => {
        capturedOptions = options;
        return cb(mock);
      }
    });
    const service = new OdontogramService(mock);

    await service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
      toothNumber: 16,
      findingType: 'CARIES',
      surfaces: ['OCCLUSAL']
    });

    assert.deepStrictEqual(capturedOptions, { isolationLevel: 'Serializable' });
  });

  await t.test('2. P2034 reintenta y tiene éxito en intento posterior', async () => {
    let attempts = 0;
    const mock = createMockPrisma({
      $transaction: async (cb: any, options: any) => {
        attempts++;
        if (attempts === 1) {
          throw new PrismaNamespace.PrismaClientKnownRequestError('Serialization conflict', {
            code: 'P2034',
            clientVersion: '1'
          });
        }
        return cb(mock);
      }
    });
    const service = new OdontogramService(mock);

    const result = await service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
      toothNumber: 16,
      findingType: 'CARIES',
      surfaces: ['OCCLUSAL']
    });

    assert.ok(result);
    assert.strictEqual(attempts, 2);
  });

  await t.test('3. P2034 falla con CONCURRENCY_ERROR (409) si excede máximo 3 intentos', async () => {
    let attempts = 0;
    const mock = createMockPrisma({
      $transaction: async () => {
        attempts++;
        throw new PrismaNamespace.PrismaClientKnownRequestError('Serialization conflict', {
          code: 'P2034',
          clientVersion: '1'
        });
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL']
      }),
      (err: any) => err.code === 'CONCURRENCY_ERROR' && err.statusCode === 409
    );

    assert.strictEqual(attempts, 3);
  });

  await t.test('4. Carrera concurrente en createFinding: tras retry de P2034 detecta duplicado (409 DENTAL_FINDING_ALREADY_EXISTS)', async () => {
    let attempts = 0;
    const mock = createMockPrisma({
      dentalFinding: {
        findMany: async () => {
          if (attempts >= 2) {
            return [
              {
                id: 'f-concurrent',
                clinicId: 'clinic-1',
                patientId: 'pat-1',
                toothNumber: 16,
                findingType: 'CARIES',
                surfaces: ['OCCLUSAL'],
                status: 'ACTIVE',
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
              }
            ];
          }
          return [];
        }
      },
      $transaction: async (cb: any) => {
        attempts++;
        if (attempts === 1) {
          throw new PrismaNamespace.PrismaClientKnownRequestError('Serialization failure', {
            code: 'P2034',
            clientVersion: '1'
          });
        }
        return cb(mock);
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL']
      }),
      (err: any) => err.code === 'DENTAL_FINDING_ALREADY_EXISTS' && err.statusCode === 409
    );

    assert.strictEqual(attempts, 2);
  });
});

test('Odontogram — Atomic Optimistic Locking via updateMany', async (t) => {
  await t.test('1. resolveFinding ejecuta updateMany con where: { id, clinicId, patientId, status: ACTIVE, version: expectedVersion } y version: { increment: 1 }', async () => {
    let capturedUpdateMany: any = null;
    const mock = createMockPrisma({
      dentalFinding: {
        findFirst: async () => ({
          id: 'f-1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          toothNumber: 16,
          status: 'RESOLVED',
          version: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } },
          resolvedBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } },
          cancelledBy: null
        }),
        updateMany: async (args: any) => {
          capturedUpdateMany = args;
          return { count: 1 };
        }
      }
    });
    const service = new OdontogramService(mock);

    await service.resolveFinding('clinic-1', 'pat-1', 'f-1', 'mem-prof', {
      expectedVersion: 1,
      resolutionNotes: 'Obturación resina'
    });

    assert.ok(capturedUpdateMany);
    assert.strictEqual(capturedUpdateMany.where.id, 'f-1');
    assert.strictEqual(capturedUpdateMany.where.clinicId, 'clinic-1');
    assert.strictEqual(capturedUpdateMany.where.patientId, 'pat-1');
    assert.strictEqual(capturedUpdateMany.where.status, 'ACTIVE');
    assert.strictEqual(capturedUpdateMany.where.version, 1);
    assert.deepStrictEqual(capturedUpdateMany.data.version, { increment: 1 });
    assert.strictEqual(capturedUpdateMany.data.status, 'RESOLVED');
  });

  await t.test('2. cancelFinding ejecuta updateMany con where: { id, clinicId, patientId, status: ACTIVE, version: expectedVersion } y version: { increment: 1 }', async () => {
    let capturedUpdateMany: any = null;
    const mock = createMockPrisma({
      dentalFinding: {
        findFirst: async () => ({
          id: 'f-1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          toothNumber: 16,
          status: 'CANCELLED',
          version: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } },
          resolvedBy: null,
          cancelledBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } }
        }),
        updateMany: async (args: any) => {
          capturedUpdateMany = args;
          return { count: 1 };
        }
      }
    });
    const service = new OdontogramService(mock);

    await service.cancelFinding('clinic-1', 'pat-1', 'f-1', 'mem-prof', {
      expectedVersion: 1,
      cancellationReason: 'Pieza seleccionada por error'
    });

    assert.ok(capturedUpdateMany);
    assert.strictEqual(capturedUpdateMany.where.id, 'f-1');
    assert.strictEqual(capturedUpdateMany.where.clinicId, 'clinic-1');
    assert.strictEqual(capturedUpdateMany.where.patientId, 'pat-1');
    assert.strictEqual(capturedUpdateMany.where.status, 'ACTIVE');
    assert.strictEqual(capturedUpdateMany.where.version, 1);
    assert.deepStrictEqual(capturedUpdateMany.data.version, { increment: 1 });
    assert.strictEqual(capturedUpdateMany.data.status, 'CANCELLED');
  });

  await t.test('3. updateMany count === 0 debido a versión desactualizada produce deterministamente 409 STALE_VERSION', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => ({
          id: 'f-1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          status: 'ACTIVE',
          version: 3
        })
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.resolveFinding('clinic-1', 'pat-1', 'f-1', 'mem-prof', {
        expectedVersion: 1
      }),
      (err: any) => err.code === 'STALE_VERSION' && err.statusCode === 409
    );
  });

  await t.test('4. updateMany count === 0 debido a estado ya RESOLVED produce deterministamente 409 INVALID_STATUS_TRANSITION', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => ({
          id: 'f-1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          status: 'RESOLVED',
          version: 1
        })
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.resolveFinding('clinic-1', 'pat-1', 'f-1', 'mem-prof', {
        expectedVersion: 1
      }),
      (err: any) => err.code === 'INVALID_STATUS_TRANSITION' && err.statusCode === 409
    );
  });

  await t.test('5. updateMany count === 0 debido a hallazgo inexistente produce deterministamente 404 NOT_FOUND', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => null
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.resolveFinding('clinic-1', 'pat-1', 'f-inexistente', 'mem-prof', {
        expectedVersion: 1
      }),
      (err: any) => err.code === 'NOT_FOUND' && err.statusCode === 404
    );
  });

  await t.test('6. AuditEvent solo se crea tras mutación exitosa (count === 1)', async () => {
    let auditCreated = false;
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => ({
          id: 'f-1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          status: 'ACTIVE',
          version: 2
        })
      },
      auditEvent: {
        create: async () => {
          auditCreated = true;
          return {} as any;
        }
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.resolveFinding('clinic-1', 'pat-1', 'f-1', 'mem-prof', {
        expectedVersion: 1
      }),
      (err: any) => err.code === 'STALE_VERSION'
    );

    assert.strictEqual(auditCreated, false, 'AuditEvent NO debe crearse si updateMany falla');
  });
});

test('Odontogram — Multi-Tenant Isolation (Read & Mutation)', async (t) => {
  await t.test('1. getOdontogram sobre paciente de otra clínica devuelve 404 NOT_FOUND', async () => {
    const mock = createMockPrisma({
      patient: {
        findFirst: async () => null
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.getOdontogram('clinic-1', 'pat-other-clinic', 'mem-prof'),
      (err: any) => err.code === 'NOT_FOUND' && err.statusCode === 404
    );
  });

  await t.test('2. getToothDetail sobre paciente de otra clínica devuelve 404 NOT_FOUND', async () => {
    const mock = createMockPrisma({
      patient: {
        findFirst: async () => null
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.getToothDetail('clinic-1', 'pat-other-clinic', 16, 'mem-prof'),
      (err: any) => err.code === 'NOT_FOUND' && err.statusCode === 404
    );
  });

  await t.test('3. createFinding sobre paciente de otra clínica devuelve 404 NOT_FOUND', async () => {
    const mock = createMockPrisma({
      patient: {
        findFirst: async () => null
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.createFinding('clinic-1', 'pat-other-clinic', 'mem-prof', {
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL']
      }),
      (err: any) => err.code === 'NOT_FOUND' && err.statusCode === 404
    );
  });

  await t.test('4. resolveFinding no encuentra findingId perteneciente a otra clínica (404 NOT_FOUND)', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => null
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.resolveFinding('clinic-1', 'pat-1', 'finding-other-clinic', 'mem-prof', {
        expectedVersion: 1
      }),
      (err: any) => err.code === 'NOT_FOUND' && err.statusCode === 404
    );
  });

  await t.test('5. cancelFinding no encuentra findingId perteneciente a otra clínica (404 NOT_FOUND)', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async () => null
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.cancelFinding('clinic-1', 'pat-1', 'finding-other-clinic', 'mem-prof', {
        expectedVersion: 1,
        cancellationReason: 'Cancelación'
      }),
      (err: any) => err.code === 'NOT_FOUND' && err.statusCode === 404
    );
  });
});

test('Odontogram — Patient Inactive Validation', async (t) => {
  await t.test('1. createFinding sobre paciente con status INACTIVE devuelve 409 PATIENT_INACTIVE', async () => {
    const mock = createMockPrisma({
      patient: {
        findFirst: async () => ({ id: 'pat-inactive', clinicId: 'clinic-1', status: 'INACTIVE' })
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.createFinding('clinic-1', 'pat-inactive', 'mem-prof', {
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL']
      }),
      (err: any) => err.code === 'PATIENT_INACTIVE' && err.statusCode === 409
    );
  });
});

test('Odontogram — Summary Calculations with Multiple Findings on Same Tooth', async (t) => {
  await t.test('1. Calcula correctamente totalActiveFindings, teethWithActiveFindings y missingTeethCount', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        findMany: async () => [
          {
            id: 'f-1',
            toothNumber: 16,
            findingType: 'CARIES',
            surfaces: ['OCCLUSAL'],
            status: 'ACTIVE',
            version: 1,
            notes: null,
            encounterId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
          },
          {
            id: 'f-2',
            toothNumber: 16,
            findingType: 'RESTORATION',
            surfaces: ['MESIAL'],
            status: 'ACTIVE',
            version: 1,
            notes: null,
            encounterId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
          },
          {
            id: 'f-3',
            toothNumber: 18,
            findingType: 'MISSING',
            surfaces: ['WHOLE_TOOTH'],
            status: 'ACTIVE',
            version: 1,
            notes: null,
            encounterId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
          },
          {
            id: 'f-4',
            toothNumber: 28,
            findingType: 'MISSING',
            surfaces: ['WHOLE_TOOTH'],
            status: 'ACTIVE',
            version: 1,
            notes: null,
            encounterId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
          },
          {
            id: 'f-5',
            toothNumber: 21,
            findingType: 'FRACTURE',
            surfaces: ['INCISAL'],
            status: 'ACTIVE',
            version: 1,
            notes: null,
            encounterId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
          }
        ]
      }
    });
    const service = new OdontogramService(mock);

    const result = await service.getOdontogram('clinic-1', 'pat-1', 'mem-prof');

    assert.strictEqual(result.summary.totalActiveFindings, 5);
    assert.strictEqual(result.summary.teethWithActiveFindings, 4);
    assert.strictEqual(result.summary.missingTeethCount, 2);
    assert.strictEqual(result.teeth[16]?.activeFindings.length, 2);
  });
});

test('Odontogram — Tooth Detail & History Separation', async (t) => {
  await t.test('1. getToothDetail separa adecuadamente activeFindings, resolvedFindings, cancelledFindings y history', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        findMany: async () => [
          {
            id: 'f-active',
            toothNumber: 16,
            findingType: 'CARIES',
            surfaces: ['OCCLUSAL'],
            status: 'ACTIVE',
            version: 1,
            notes: 'Caries superficial',
            encounterId: null,
            resolutionEncounterId: null,
            resolutionNotes: null,
            resolvedAt: null,
            cancellationReason: null,
            cancelledAt: null,
            createdAt: new Date('2026-08-20'),
            updatedAt: new Date('2026-08-20'),
            createdBy: { id: 'mem-prof', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } },
            resolvedBy: null,
            cancelledBy: null
          },
          {
            id: 'f-resolved',
            toothNumber: 16,
            findingType: 'CARIES',
            surfaces: ['MESIAL'],
            status: 'RESOLVED',
            version: 2,
            notes: 'Caries interproximal tratada',
            encounterId: null,
            resolutionEncounterId: null,
            resolutionNotes: 'Resina 3M colocada',
            resolvedAt: new Date('2026-08-25'),
            cancellationReason: null,
            cancelledAt: null,
            createdAt: new Date('2026-08-10'),
            updatedAt: new Date('2026-08-25'),
            createdBy: { id: 'mem-prof', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } },
            resolvedBy: { id: 'mem-prof', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } },
            cancelledBy: null
          },
          {
            id: 'f-cancelled',
            toothNumber: 16,
            findingType: 'FRACTURE',
            surfaces: ['DISTAL'],
            status: 'CANCELLED',
            version: 2,
            notes: null,
            encounterId: null,
            resolutionEncounterId: null,
            resolutionNotes: null,
            resolvedAt: null,
            cancellationReason: 'Diagnóstico descartado',
            cancelledAt: new Date('2026-08-22'),
            createdAt: new Date('2026-08-21'),
            updatedAt: new Date('2026-08-22'),
            createdBy: { id: 'mem-prof', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } },
            resolvedBy: null,
            cancelledBy: { id: 'mem-prof', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
          }
        ]
      }
    });
    const service = new OdontogramService(mock);

    const detail = await service.getToothDetail('clinic-1', 'pat-1', 16, 'mem-prof');

    assert.strictEqual(detail.toothNumber, 16);
    assert.strictEqual(detail.toothName, 'Primer Molar Superior Derecho');
    assert.strictEqual(detail.activeFindings.length, 1);
    assert.strictEqual(detail.activeFindings[0]?.id, 'f-active');
    assert.strictEqual(detail.resolvedFindings.length, 1);
    assert.strictEqual(detail.resolvedFindings[0]?.id, 'f-resolved');
    assert.strictEqual(detail.cancelledFindings.length, 1);
    assert.strictEqual(detail.cancelledFindings[0]?.id, 'f-cancelled');
    assert.strictEqual(detail.history.length, 3);
  });
});

test('Odontogram — Sequential Duplicate Detection (Non-Concurrent)', async (t) => {
  await t.test('1. Rechaza duplicado secuencial exacto del mismo tipo, diente y superficies en orden distinto (409 DENTAL_FINDING_ALREADY_EXISTS)', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        findMany: async () => [
          {
            id: 'f-1',
            clinicId: 'clinic-1',
            patientId: 'pat-1',
            toothNumber: 16,
            findingType: 'CARIES',
            surfaces: ['MESIAL', 'OCCLUSAL'],
            status: 'ACTIVE'
          }
        ],
        create: async (args: any) => ({ id: 'f-new', ...args.data, version: 1 })
      }
    });
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL', 'MESIAL']
      }),
      (err: any) => err.code === 'DENTAL_FINDING_ALREADY_EXISTS' && err.statusCode === 409
    );
  });

  await t.test('2. Permite registrar hallazgos de distinto tipo en la misma pieza (ej. CROWN + FRACTURE)', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        findMany: async () => [
          {
            id: 'f-crown',
            clinicId: 'clinic-1',
            patientId: 'pat-1',
            toothNumber: 16,
            findingType: 'CROWN',
            surfaces: ['WHOLE_TOOTH'],
            status: 'ACTIVE',
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } }
          }
        ]
      }
    });
    const service = new OdontogramService(mock);

    const finding = await service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
      toothNumber: 16,
      findingType: 'FRACTURE',
      surfaces: ['VESTIBULAR']
    });

    assert.ok(finding);
    assert.strictEqual(finding.findingType, 'FRACTURE');
  });

  await t.test('3. Permite registrar mismo tipo en distintas superficies (ej. CARIES en OCCLUSAL y CARIES en DISTAL)', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        findMany: async () => [
          {
            id: 'f-caries-occ',
            clinicId: 'clinic-1',
            patientId: 'pat-1',
            toothNumber: 16,
            findingType: 'CARIES',
            surfaces: ['OCCLUSAL'],
            status: 'ACTIVE',
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } }
          }
        ]
      }
    });
    const service = new OdontogramService(mock);

    const finding = await service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
      toothNumber: 16,
      findingType: 'CARIES',
      surfaces: ['DISTAL']
    });

    assert.ok(finding);
    assert.strictEqual(finding.findingType, 'CARIES');
  });
});

test('Odontogram — AuditEvent Metadata Strict Technical Filtering', async (t) => {
  await t.test('1. CREATE genera AuditEvent sin patientId, encounterId, toothNumber, findingType, surfaces ni notas', async () => {
    let capturedAudit: any;
    const mock = createMockPrisma({
      auditEvent: {
        create: async (args: any) => {
          capturedAudit = args.data;
          return { id: 'a-1', ...args.data };
        }
      }
    });
    const service = new OdontogramService(mock);

    await service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
      toothNumber: 16,
      findingType: 'CARIES',
      surfaces: ['OCCLUSAL', 'DISTAL'],
      notes: 'Caries cavitada profunda con dolor a la percusión',
      encounterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    });

    assert.ok(capturedAudit);
    assert.strictEqual(capturedAudit.action, 'DENTAL_FINDING_CREATED');
    assert.strictEqual(capturedAudit.entityType, 'DentalFinding');

    const meta = capturedAudit.metadata;
    assert.strictEqual(meta.patientId, undefined);
    assert.strictEqual(meta.encounterId, undefined);
    assert.strictEqual(meta.resolutionEncounterId, undefined);
    assert.strictEqual(meta.toothNumber, undefined);
    assert.strictEqual(meta.findingType, undefined);
    assert.strictEqual(meta.surfaces, undefined);
    assert.strictEqual(meta.notes, undefined);
    assert.strictEqual(meta.resolutionNotes, undefined);
    assert.strictEqual(meta.cancellationReason, undefined);

    assert.strictEqual(meta.previousStatus, null);
    assert.strictEqual(meta.newStatus, 'ACTIVE');
    assert.strictEqual(meta.previousVersion, null);
    assert.strictEqual(meta.newVersion, 1);
    assert.ok(Array.isArray(meta.fieldsChanged));
  });

  await t.test('2. RESOLVE genera AuditEvent sin patientId, resolutionEncounterId, notas ni datos clínicos', async () => {
    let capturedAudit: any;
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => ({
          id: 'f-1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          toothNumber: 16,
          status: 'RESOLVED',
          version: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } },
          resolvedBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } },
          cancelledBy: null
        })
      },
      auditEvent: {
        create: async (args: any) => {
          capturedAudit = args.data;
          return { id: 'a-1', ...args.data };
        }
      }
    });
    const service = new OdontogramService(mock);

    await service.resolveFinding('clinic-1', 'pat-1', 'f-1', 'mem-prof', {
      expectedVersion: 1,
      resolutionNotes: 'Tratamiento de conducto radicular completado',
      resolutionEncounterId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
    });

    assert.ok(capturedAudit);
    assert.strictEqual(capturedAudit.action, 'DENTAL_FINDING_RESOLVED');
    const meta = capturedAudit.metadata;
    assert.strictEqual(meta.patientId, undefined);
    assert.strictEqual(meta.encounterId, undefined);
    assert.strictEqual(meta.resolutionEncounterId, undefined);
    assert.strictEqual(meta.toothNumber, undefined);
    assert.strictEqual(meta.findingType, undefined);
    assert.strictEqual(meta.surfaces, undefined);
    assert.strictEqual(meta.notes, undefined);
    assert.strictEqual(meta.resolutionNotes, undefined);
    assert.strictEqual(meta.cancellationReason, undefined);

    assert.strictEqual(meta.previousStatus, 'ACTIVE');
    assert.strictEqual(meta.newStatus, 'RESOLVED');
    assert.strictEqual(meta.previousVersion, 1);
    assert.strictEqual(meta.newVersion, 2);
    assert.ok(Array.isArray(meta.fieldsChanged));
  });

  await t.test('3. CANCEL genera AuditEvent sin patientId, motivos clínicos ni notas', async () => {
    let capturedAudit: any;
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => ({
          id: 'f-1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          status: 'CANCELLED',
          version: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } },
          resolvedBy: null,
          cancelledBy: { id: 'm-1', role: 'PROFESSIONAL', user: { firstName: 'Dr', lastName: 'A' } }
        })
      },
      auditEvent: {
        create: async (args: any) => {
          capturedAudit = args.data;
          return { id: 'a-1', ...args.data };
        }
      }
    });
    const service = new OdontogramService(mock);

    await service.cancelFinding('clinic-1', 'pat-1', 'f-1', 'mem-prof', {
      expectedVersion: 1,
      cancellationReason: 'Diente incorrecto diagnosticado por error'
    });

    assert.ok(capturedAudit);
    assert.strictEqual(capturedAudit.action, 'DENTAL_FINDING_CANCELLED');
    const meta = capturedAudit.metadata;
    assert.strictEqual(meta.patientId, undefined);
    assert.strictEqual(meta.encounterId, undefined);
    assert.strictEqual(meta.resolutionEncounterId, undefined);
    assert.strictEqual(meta.toothNumber, undefined);
    assert.strictEqual(meta.findingType, undefined);
    assert.strictEqual(meta.surfaces, undefined);
    assert.strictEqual(meta.notes, undefined);
    assert.strictEqual(meta.resolutionNotes, undefined);
    assert.strictEqual(meta.cancellationReason, undefined);

    assert.strictEqual(meta.previousStatus, 'ACTIVE');
    assert.strictEqual(meta.newStatus, 'CANCELLED');
    assert.strictEqual(meta.previousVersion, 1);
    assert.strictEqual(meta.newVersion, 2);
    assert.ok(Array.isArray(meta.fieldsChanged));
  });
});

test('Odontogram — Mutation Response DTO Contract (Create, Resolve, Cancel)', async (t) => {
  await t.test('1. createFinding retorna DTO explícito DentalFindingItem sin clinicId, patientId ni FKs internas', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        findMany: async () => [],
        create: async (args: any) => ({
          id: 'finding-100',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          toothNumber: 16,
          findingType: 'CARIES',
          surfaces: ['OCCLUSAL'],
          status: 'ACTIVE',
          version: 1,
          notes: 'Nota clínica',
          encounterId: 'enc-1',
          createdByMembershipId: 'mem-prof',
          updatedByMembershipId: 'mem-prof',
          createdAt: new Date('2026-08-29T12:00:00.000Z'),
          updatedAt: new Date('2026-08-29T12:00:00.000Z')
        }),
        findFirst: async () => ({
          id: 'finding-100',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          toothNumber: 16,
          findingType: 'CARIES',
          surfaces: ['OCCLUSAL'],
          status: 'ACTIVE',
          version: 1,
          notes: 'Nota clínica',
          encounterId: 'enc-1',
          resolutionEncounterId: null,
          resolutionNotes: null,
          resolvedAt: null,
          cancellationReason: null,
          cancelledAt: null,
          createdByMembershipId: 'mem-prof',
          updatedByMembershipId: 'mem-prof',
          createdAt: new Date('2026-08-29T12:00:00.000Z'),
          updatedAt: new Date('2026-08-29T12:00:00.000Z'),
          createdBy: {
            id: 'mem-prof',
            role: 'PROFESSIONAL',
            user: { firstName: 'Dra', lastName: 'Ana' }
          },
          resolvedBy: null,
          cancelledBy: null
        })
      }
    });
    const service = new OdontogramService(mock);

    const result = await service.createFinding('clinic-1', 'pat-1', 'mem-prof', {
      toothNumber: 16,
      findingType: 'CARIES',
      surfaces: ['OCCLUSAL'],
      notes: 'Nota clínica',
      encounterId: 'enc-1'
    });

    assert.strictEqual(result.id, 'finding-100');
    assert.strictEqual(result.toothNumber, 16);
    assert.strictEqual(result.findingType, 'CARIES');
    assert.deepStrictEqual(result.surfaces, ['OCCLUSAL']);
    assert.strictEqual(result.status, 'ACTIVE');
    assert.strictEqual(result.version, 1);
    assert.strictEqual(result.notes, 'Nota clínica');
    assert.strictEqual(result.encounterId, 'enc-1');
    assert.deepStrictEqual(result.createdBy, {
      id: 'mem-prof',
      role: 'PROFESSIONAL',
      name: 'Dra Ana'
    });
    assert.strictEqual(result.resolvedBy, null);
    assert.strictEqual(result.cancelledBy, null);

    assert.strictEqual((result as any).clinicId, undefined);
    assert.strictEqual((result as any).patientId, undefined);
    assert.strictEqual((result as any).createdByMembershipId, undefined);
    assert.strictEqual((result as any).updatedByMembershipId, undefined);
    assert.strictEqual((result as any).resolvedByMembershipId, undefined);
    assert.strictEqual((result as any).cancelledByMembershipId, undefined);
  });

  await t.test('2. resolveFinding retorna DTO explícito con resolvedBy y sin FKs internas', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => ({
          id: 'finding-100',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          toothNumber: 16,
          findingType: 'CARIES',
          surfaces: ['OCCLUSAL'],
          status: 'RESOLVED',
          version: 2,
          notes: 'Nota previa',
          encounterId: 'enc-1',
          resolutionEncounterId: 'enc-res-2',
          resolutionNotes: 'Caries obturada con resina',
          resolvedAt: new Date('2026-08-29T15:00:00.000Z'),
          cancellationReason: null,
          cancelledAt: null,
          createdByMembershipId: 'mem-prof',
          updatedByMembershipId: 'mem-prof',
          resolvedByMembershipId: 'mem-prof',
          createdAt: new Date('2026-08-29T12:00:00.000Z'),
          updatedAt: new Date('2026-08-29T15:00:00.000Z'),
          createdBy: {
            id: 'mem-prof',
            role: 'PROFESSIONAL',
            user: { firstName: 'Dra', lastName: 'Ana' }
          },
          resolvedBy: {
            id: 'mem-prof',
            role: 'PROFESSIONAL',
            user: { firstName: 'Dra', lastName: 'Ana' }
          },
          cancelledBy: null
        })
      }
    });
    const service = new OdontogramService(mock);

    const result = await service.resolveFinding('clinic-1', 'pat-1', 'finding-100', 'mem-prof', {
      expectedVersion: 1,
      resolutionNotes: 'Caries obturada con resina',
      resolutionEncounterId: 'enc-res-2'
    });

    assert.strictEqual(result.id, 'finding-100');
    assert.strictEqual(result.status, 'RESOLVED');
    assert.strictEqual(result.version, 2);
    assert.strictEqual(result.resolutionNotes, 'Caries obturada con resina');
    assert.strictEqual(result.resolutionEncounterId, 'enc-res-2');
    assert.strictEqual(result.resolvedAt, '2026-08-29T15:00:00.000Z');
    assert.deepStrictEqual(result.resolvedBy, {
      id: 'mem-prof',
      role: 'PROFESSIONAL',
      name: 'Dra Ana'
    });

    assert.strictEqual((result as any).clinicId, undefined);
    assert.strictEqual((result as any).patientId, undefined);
    assert.strictEqual((result as any).resolvedByMembershipId, undefined);
  });

  await t.test('3. cancelFinding retorna DTO explícito con cancelledBy y sin FKs internas', async () => {
    const mock = createMockPrisma({
      dentalFinding: {
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => ({
          id: 'finding-100',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          toothNumber: 16,
          findingType: 'CARIES',
          surfaces: ['OCCLUSAL'],
          status: 'CANCELLED',
          version: 2,
          notes: 'Nota previa',
          encounterId: null,
          resolutionEncounterId: null,
          resolutionNotes: null,
          resolvedAt: null,
          cancellationReason: 'Diagnóstico equivocado',
          cancelledAt: new Date('2026-08-29T16:00:00.000Z'),
          createdByMembershipId: 'mem-prof',
          updatedByMembershipId: 'mem-prof',
          cancelledByMembershipId: 'mem-prof',
          createdAt: new Date('2026-08-29T12:00:00.000Z'),
          updatedAt: new Date('2026-08-29T16:00:00.000Z'),
          createdBy: {
            id: 'mem-prof',
            role: 'PROFESSIONAL',
            user: { firstName: 'Dra', lastName: 'Ana' }
          },
          resolvedBy: null,
          cancelledBy: {
            id: 'mem-prof',
            role: 'PROFESSIONAL',
            user: { firstName: 'Dra', lastName: 'Ana' }
          }
        })
      }
    });
    const service = new OdontogramService(mock);

    const result = await service.cancelFinding('clinic-1', 'pat-1', 'finding-100', 'mem-prof', {
      expectedVersion: 1,
      cancellationReason: 'Diagnóstico equivocado'
    });

    assert.strictEqual(result.id, 'finding-100');
    assert.strictEqual(result.status, 'CANCELLED');
    assert.strictEqual(result.version, 2);
    assert.strictEqual(result.cancellationReason, 'Diagnóstico equivocado');
    assert.strictEqual(result.cancelledAt, '2026-08-29T16:00:00.000Z');
    assert.deepStrictEqual(result.cancelledBy, {
      id: 'mem-prof',
      role: 'PROFESSIONAL',
      name: 'Dra Ana'
    });

    assert.strictEqual((result as any).clinicId, undefined);
    assert.strictEqual((result as any).patientId, undefined);
    assert.strictEqual((result as any).cancelledByMembershipId, undefined);
  });
});

test('Odontogram V1.1 — Domain Schema & FDI Batch Validations', async (t) => {
  await t.test('1. batchOdontogramActionSchema acepta CREATE_FINDING válido con superficies anterior/posterior', () => {
    const valid = batchOdontogramActionSchema.safeParse({
      requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      items: [
        { toothNumber: 13, surfaces: ['INCISAL'] },
        { toothNumber: 14, surfaces: ['OCCLUSAL'] },
        { toothNumber: 16, surfaces: ['OCCLUSAL', 'MESIAL'] }
      ]
    });
    assert.ok(valid.success);
  });

  await t.test('2. batchOdontogramActionSchema acepta RECORD_ASSESSMENT válido de tipo HEALTHY', () => {
    const valid = batchOdontogramActionSchema.safeParse({
      requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      action: 'RECORD_ASSESSMENT',
      assessmentType: 'HEALTHY',
      notes: 'Evaluación inicial',
      items: [
        { toothNumber: 11 },
        { toothNumber: 12 },
        { toothNumber: 13 }
      ]
    });
    assert.ok(valid.success);
  });

  await t.test('3. Rechaza piezas duplicadas dentro del mismo batch payload', () => {
    const duplicate = batchOdontogramActionSchema.safeParse({
      requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      items: [
        { toothNumber: 14, surfaces: ['OCCLUSAL'] },
        { toothNumber: 14, surfaces: ['MESIAL'] }
      ]
    });
    assert.strictEqual(duplicate.success, false);
  });

  await t.test('4. Rechaza lote vacío (0 piezas) o con más de 32 piezas', () => {
    const empty = batchOdontogramActionSchema.safeParse({
      requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      action: 'RECORD_ASSESSMENT',
      assessmentType: 'HEALTHY',
      items: []
    });
    assert.strictEqual(empty.success, false);

    const tooMany = batchOdontogramActionSchema.safeParse({
      requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      action: 'RECORD_ASSESSMENT',
      assessmentType: 'HEALTHY',
      items: Array.from({ length: 33 }, (_, i) => ({ toothNumber: 11 }))
    });
    assert.strictEqual(tooMany.success, false);
  });

  await t.test('5. Rechaza superficie OCCLUSAL en anterior e INCISAL en posterior en lote', () => {
    const invalidAnterior = batchOdontogramActionSchema.safeParse({
      requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      items: [{ toothNumber: 11, surfaces: ['OCCLUSAL'] }]
    });
    assert.strictEqual(invalidAnterior.success, false);

    const invalidPosterior = batchOdontogramActionSchema.safeParse({
      requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      items: [{ toothNumber: 16, surfaces: ['INCISAL'] }]
    });
    assert.strictEqual(invalidPosterior.success, false);
  });
});

test('Odontogram V1.1 — Batch Mutations & Atomic Validation', async (t) => {
  await t.test('1. batch válido de findings crea múltiples registros y emite AuditEvent técnico sin PHI', async () => {
    let capturedAudit: any;
    const mock = createMockPrisma({
      auditEvent: {
        create: async (args: any) => {
          capturedAudit = args.data;
          return { id: 'audit-batch-1', ...args.data };
        }
      }
    });
    const service = new OdontogramService(mock);

    const result = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
      requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      notes: 'Caries en premolares',
      items: [
        { toothNumber: 14, surfaces: ['OCCLUSAL'] },
        { toothNumber: 15, surfaces: ['OCCLUSAL', 'DISTAL'] }
      ]
    });

    assert.strictEqual(result.appliedCount, 2);
    assert.strictEqual(result.action, 'CREATE_FINDING');
    assert.strictEqual(result.findings.length, 2);
    assert.strictEqual(result.findings[0]?.toothNumber, 14);
    assert.strictEqual(result.findings[1]?.toothNumber, 15);
    assert.strictEqual(mock._getCreatedFindings().length, 2);

    assert.ok(capturedAudit);
    assert.strictEqual(capturedAudit.action, 'DENTAL_ODONTOGRAM_BATCH_CREATED');
    assert.strictEqual(capturedAudit.entityType, 'DentalFinding');
    assert.strictEqual(capturedAudit.metadata.actionType, 'CREATE_FINDING');
    assert.strictEqual(capturedAudit.metadata.itemCount, 2);
    assert.strictEqual(capturedAudit.metadata.toothNumber, undefined);
    assert.strictEqual(capturedAudit.metadata.findingType, undefined);
    assert.strictEqual(capturedAudit.metadata.surfaces, undefined);
    assert.strictEqual(capturedAudit.metadata.notes, undefined);
  });

  await t.test('2. batch válido de HEALTHY crea múltiples ToothAssessment inmutables', async () => {
    let capturedAudit: any;
    const mock = createMockPrisma({
      auditEvent: {
        create: async (args: any) => {
          capturedAudit = args.data;
          return { id: 'audit-batch-2', ...args.data };
        }
      }
    });
    const service = new OdontogramService(mock);

    const result = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
      requestId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      action: 'RECORD_ASSESSMENT',
      assessmentType: 'HEALTHY',
      notes: 'Piezas evaluadas sanas',
      items: [
        { toothNumber: 11 },
        { toothNumber: 12 },
        { toothNumber: 13 }
      ]
    });

    assert.strictEqual(result.appliedCount, 3);
    assert.strictEqual(result.action, 'RECORD_ASSESSMENT');
    assert.strictEqual(result.assessments.length, 3);
    assert.strictEqual(result.assessments[0]?.toothNumber, 11);
    assert.strictEqual(result.assessments[0]?.assessmentType, 'HEALTHY');
    assert.strictEqual(mock._getCreatedAssessments().length, 3);

    assert.ok(capturedAudit);
    assert.strictEqual(capturedAudit.action, 'DENTAL_ODONTOGRAM_BATCH_CREATED');
    assert.strictEqual(capturedAudit.entityType, 'ToothAssessment');
    assert.strictEqual(capturedAudit.metadata.actionType, 'RECORD_ASSESSMENT');
    assert.strictEqual(capturedAudit.metadata.itemCount, 3);
  });

  await t.test('3. HEALTHY + RESTORATION en la misma pieza es permitido', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-restoration',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 16,
        findingType: 'RESTORATION',
        surfaces: ['OCCLUSAL'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    const result = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
      requestId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      action: 'RECORD_ASSESSMENT',
      assessmentType: 'HEALTHY',
      items: [{ toothNumber: 16 }]
    });

    assert.strictEqual(result.appliedCount, 1);
    assert.strictEqual(result.assessments.length, 1);
    assert.strictEqual(result.assessments[0]?.toothNumber, 16);
  });

  await t.test('4. HEALTHY + CROWN en la misma pieza es permitido', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-crown',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 26,
        findingType: 'CROWN',
        surfaces: ['WHOLE_TOOTH'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    const result = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
      requestId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      action: 'RECORD_ASSESSMENT',
      assessmentType: 'HEALTHY',
      items: [{ toothNumber: 26 }]
    });

    assert.strictEqual(result.appliedCount, 1);
    assert.strictEqual(result.assessments[0]?.toothNumber, 26);
  });

  await t.test('5. HEALTHY bloqueado por CARIES ACTIVE (409 DENTAL_FINDING_INCOMPATIBLE)', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-caries',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 14,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        action: 'RECORD_ASSESSMENT',
        assessmentType: 'HEALTHY',
        items: [{ toothNumber: 14 }]
      }),
      (err: any) => {
        return (
          err.code === 'BATCH_VALIDATION_FAILED' &&
          err.statusCode === 409 &&
          err.details?.failures?.[0]?.reasonCode === 'DENTAL_FINDING_INCOMPATIBLE'
        );
      }
    );
  });

  await t.test('6. HEALTHY bloqueado por FRACTURE ACTIVE (409 DENTAL_FINDING_INCOMPATIBLE)', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-fracture',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 21,
        findingType: 'FRACTURE',
        surfaces: ['INCISAL'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
        action: 'RECORD_ASSESSMENT',
        assessmentType: 'HEALTHY',
        items: [{ toothNumber: 21 }]
      }),
      (err: any) => err.details?.failures?.[0]?.reasonCode === 'DENTAL_FINDING_INCOMPATIBLE'
    );
  });

  await t.test('7. HEALTHY bloqueado por EXTRACTION_INDICATED ACTIVE (409 DENTAL_FINDING_INCOMPATIBLE)', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-ext',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 38,
        findingType: 'EXTRACTION_INDICATED',
        surfaces: ['WHOLE_TOOTH'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77',
        action: 'RECORD_ASSESSMENT',
        assessmentType: 'HEALTHY',
        items: [{ toothNumber: 38 }]
      }),
      (err: any) => err.details?.failures?.[0]?.reasonCode === 'DENTAL_FINDING_INCOMPATIBLE'
    );
  });

  await t.test('8. HEALTHY bloqueado por MISSING ACTIVE (409 DENTAL_FINDING_INCOMPATIBLE)', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-missing',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 46,
        findingType: 'MISSING',
        surfaces: ['WHOLE_TOOTH'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: 'a2eebc99-9c0b-4ef8-bb6d-6bb9bd380a88',
        action: 'RECORD_ASSESSMENT',
        assessmentType: 'HEALTHY',
        items: [{ toothNumber: 46 }]
      }),
      (err: any) => err.details?.failures?.[0]?.reasonCode === 'DENTAL_FINDING_INCOMPATIBLE'
    );
  });

  await t.test('9. HEALTHY bloqueado por OTHER ACTIVE (409 DENTAL_FINDING_INCOMPATIBLE)', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-other',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 11,
        findingType: 'OTHER',
        surfaces: ['WHOLE_TOOTH'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: 'a3eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
        action: 'RECORD_ASSESSMENT',
        assessmentType: 'HEALTHY',
        items: [{ toothNumber: 11 }]
      }),
      (err: any) => err.details?.failures?.[0]?.reasonCode === 'DENTAL_FINDING_INCOMPATIBLE'
    );
  });

  await t.test('10. Múltiples failures en un solo batch devuelve el array completo de errores', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-missing',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 16,
        findingType: 'MISSING',
        surfaces: ['WHOLE_TOOTH'],
        status: 'ACTIVE'
      },
      {
        id: 'f-caries-occ',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 26,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: 'a4eebc99-9c0b-4ef8-bb6d-6bb9bd380a00',
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [
          { toothNumber: 14, surfaces: ['OCCLUSAL'] }, // OK
          { toothNumber: 16, surfaces: ['OCCLUSAL'] }, // Falla: MISSING incompatible
          { toothNumber: 26, surfaces: ['OCCLUSAL'] }  // Falla: Duplicado exacto
        ]
      }),
      (err: any) => {
        assert.strictEqual(err.code, 'BATCH_VALIDATION_FAILED');
        assert.strictEqual(err.statusCode, 409);
        assert.ok(Array.isArray(err.details?.failures));
        assert.strictEqual(err.details.failures.length, 2);
        assert.strictEqual(err.details.failures[0].index, 1);
        assert.strictEqual(err.details.failures[0].toothNumber, 16);
        assert.strictEqual(err.details.failures[0].reasonCode, 'DENTAL_FINDING_INCOMPATIBLE');
        assert.strictEqual(err.details.failures[1].index, 2);
        assert.strictEqual(err.details.failures[1].toothNumber, 26);
        assert.strictEqual(err.details.failures[1].reasonCode, 'DENTAL_FINDING_ALREADY_EXISTS');
        return true;
      }
    );
  });

  await t.test('11. 0 escrituras cuando cualquier item falla en validación de lote (atomicidad estricta)', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-missing',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 16,
        findingType: 'MISSING',
        surfaces: ['WHOLE_TOOTH'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: 'a5eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [
          { toothNumber: 14, surfaces: ['OCCLUSAL'] },
          { toothNumber: 15, surfaces: ['OCCLUSAL'] },
          { toothNumber: 16, surfaces: ['OCCLUSAL'] }
        ]
      }),
      (err: any) => err.code === 'BATCH_VALIDATION_FAILED'
    );

    assert.strictEqual(mock._getNewlyCreatedFindings().length, 0, 'No debe haberse escrito ningún registro');
  });

  await t.test('12. Duplicado de DentalFinding en batch falla con DENTAL_FINDING_ALREADY_EXISTS', async () => {
    const mock = createMockPrisma({}, [
      {
        id: 'f-existing',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 14,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL'],
        status: 'ACTIVE'
      }
    ]);
    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: 'a6eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [{ toothNumber: 14, surfaces: ['OCCLUSAL'] }]
      }),
      (err: any) => err.details?.failures?.[0]?.reasonCode === 'DENTAL_FINDING_ALREADY_EXISTS'
    );
  });
});

test('Odontogram V1.1 — Currently Healthy Domain Calculation & Temporal Semantics', async (t) => {
  await t.test('1. HEALTHY histórico -> CARIES -> RESOLVED resulta en currentlyHealthy = false', async () => {
    const service = new OdontogramService(createMockPrisma());

    const toothFindings = [
      {
        id: 'f-caries-resolved',
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL'],
        status: 'RESOLVED',
        createdAt: new Date('2026-09-05T12:00:00.000Z')
      }
    ];

    const toothAssessments = [
      {
        id: 'a-healthy-old',
        toothNumber: 16,
        assessmentType: 'HEALTHY',
        assessedAt: new Date('2026-08-30T12:00:00.000Z'),
        createdAt: new Date('2026-08-30T12:00:00.000Z')
      }
    ];

    const result = service.calculateToothHealthyStatus(16, toothFindings, toothAssessments);
    assert.strictEqual(result.currentlyHealthy, false, 'No puede ser currentlyHealthy porque surgió caries posterior que invalidó la evaluación');
  });

  await t.test('2. HEALTHY histórico -> CARIES -> CANCELLED resulta en currentlyHealthy = true', async () => {
    const service = new OdontogramService(createMockPrisma());

    const toothFindings = [
      {
        id: 'f-caries-cancelled',
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL'],
        status: 'CANCELLED',
        createdAt: new Date('2026-09-05T12:00:00.000Z')
      }
    ];

    const toothAssessments = [
      {
        id: 'a-healthy-old',
        toothNumber: 16,
        assessmentType: 'HEALTHY',
        assessedAt: new Date('2026-08-30T12:00:00.000Z'),
        createdAt: new Date('2026-08-30T12:00:00.000Z')
      }
    ];

    const result = service.calculateToothHealthyStatus(16, toothFindings, toothAssessments);
    assert.strictEqual(result.currentlyHealthy, true, 'Debe ser currentlyHealthy porque el hallazgo posterior fue CANCELLED');
  });

  await t.test('3. Nueva valoración HEALTHY posterior a CARIES RESOLVED resulta en currentlyHealthy = true', async () => {
    const service = new OdontogramService(createMockPrisma());

    const toothFindings = [
      {
        id: 'f-caries-resolved',
        toothNumber: 16,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL'],
        status: 'RESOLVED',
        createdAt: new Date('2026-09-05T12:00:00.000Z')
      }
    ];

    const toothAssessments = [
      {
        id: 'a-healthy-old',
        toothNumber: 16,
        assessmentType: 'HEALTHY',
        assessedAt: new Date('2026-08-30T12:00:00.000Z'),
        createdAt: new Date('2026-08-30T12:00:00.000Z')
      },
      {
        id: 'a-healthy-new',
        toothNumber: 16,
        assessmentType: 'HEALTHY',
        assessedAt: new Date('2026-09-15T12:00:00.000Z'),
        createdAt: new Date('2026-09-15T12:00:00.000Z')
      }
    ];

    const result = service.calculateToothHealthyStatus(16, toothFindings, toothAssessments);
    assert.strictEqual(result.currentlyHealthy, true, 'Debe ser currentlyHealthy porque la nueva evaluación es posterior al hallazgo resuelto');
  });
});

test('Odontogram V1.1 — RequestId Idempotency Ledger & Fingerprinting', async (t) => {
  await t.test('A. Mismo requestId + mismo CREATE_FINDING payload devuelve resultado anterior y 0 nuevas escrituras', async () => {
    const mock = createMockPrisma();
    const service = new OdontogramService(mock);

    const payload = {
      requestId: 'a7eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      action: 'CREATE_FINDING' as const,
      findingType: 'CARIES' as const,
      notes: 'Caries inicial',
      items: [
        { toothNumber: 14, surfaces: ['OCCLUSAL' as const] },
        { toothNumber: 15, surfaces: ['OCCLUSAL' as const] }
      ]
    };

    // First call: writes records and ledger
    const res1 = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', payload);
    assert.strictEqual(res1.appliedCount, 2);
    assert.strictEqual(mock._getNewlyCreatedFindings().length, 2);
    assert.strictEqual(mock._getAuditEvents().length, 1);

    // Second call: legitimate retry
    const res2 = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', payload);
    assert.strictEqual(res2.appliedCount, 2);
    assert.strictEqual(res2.findings[0]?.id, res1.findings[0]?.id);
    assert.strictEqual(res2.findings[1]?.id, res1.findings[1]?.id);
    assert.strictEqual(mock._getNewlyCreatedFindings().length, 2, 'No debe escribir nuevos hallazgos');
    assert.strictEqual(mock._getAuditEvents().length, 1, 'No debe crear nuevo AuditEvent');
  });

  await t.test('B. Mismo requestId + mismo HEALTHY payload devuelve resultado anterior y 0 nuevas escrituras', async () => {
    const mock = createMockPrisma();
    const service = new OdontogramService(mock);

    const payload = {
      requestId: 'a8eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      action: 'RECORD_ASSESSMENT' as const,
      assessmentType: 'HEALTHY' as const,
      notes: 'Sanas',
      items: [{ toothNumber: 11 }, { toothNumber: 12 }]
    };

    const res1 = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', payload);
    assert.strictEqual(res1.appliedCount, 2);
    assert.strictEqual(mock._getNewlyCreatedAssessments().length, 2);
    assert.strictEqual(mock._getAuditEvents().length, 1);

    const res2 = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', payload);
    assert.strictEqual(res2.appliedCount, 2);
    assert.strictEqual(res2.assessments[0]?.id, res1.assessments[0]?.id);
    assert.strictEqual(mock._getNewlyCreatedAssessments().length, 2, 'No debe escribir nuevos assessments');
    assert.strictEqual(mock._getAuditEvents().length, 1, 'No debe crear nuevo AuditEvent');
  });

  await t.test('C. Mismo requestId + payload CREATE_FINDING diferente lanza 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const mock = createMockPrisma();
    const service = new OdontogramService(mock);

    const reqId = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
      requestId: reqId,
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      items: [{ toothNumber: 14, surfaces: ['OCCLUSAL'] }]
    });

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: reqId,
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [{ toothNumber: 15, surfaces: ['OCCLUSAL'] }] // Diente diferente
      }),
      (err: any) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 409
    );
  });

  await t.test('D. Mismo requestId usado CREATE_FINDING y después RECORD_ASSESSMENT lanza 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const mock = createMockPrisma();
    const service = new OdontogramService(mock);

    const reqId = 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

    await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
      requestId: reqId,
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      items: [{ toothNumber: 14, surfaces: ['OCCLUSAL'] }]
    });

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: reqId,
        action: 'RECORD_ASSESSMENT',
        assessmentType: 'HEALTHY',
        items: [{ toothNumber: 14 }]
      }),
      (err: any) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 409
    );
  });

  await t.test('E. Mismo requestId + mismas piezas pero surfaces diferentes lanza 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const mock = createMockPrisma();
    const service = new OdontogramService(mock);

    const reqId = 'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

    await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
      requestId: reqId,
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      items: [{ toothNumber: 16, surfaces: ['OCCLUSAL'] }]
    });

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: reqId,
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [{ toothNumber: 16, surfaces: ['OCCLUSAL', 'MESIAL'] }]
      }),
      (err: any) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 409
    );
  });

  await t.test('F. Mismo requestId + notes diferentes lanza 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const mock = createMockPrisma();
    const service = new OdontogramService(mock);

    const reqId = 'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

    await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
      requestId: reqId,
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      notes: 'Nota original',
      items: [{ toothNumber: 16, surfaces: ['OCCLUSAL'] }]
    });

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: reqId,
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        notes: 'Nota modificada',
        items: [{ toothNumber: 16, surfaces: ['OCCLUSAL'] }]
      }),
      (err: any) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 409
    );
  });

  await t.test('G. Fingerprint es determinista ante orden arbitrario de items y surfaces', () => {
    const fp1 = computeOdontogramBatchFingerprint({
      requestId: '00000000-0000-0000-0000-000000000001',
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      encounterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      notes: 'Nota de lote',
      items: [
        { toothNumber: 15, surfaces: ['DISTAL', 'OCCLUSAL'] },
        { toothNumber: 14, surfaces: ['OCCLUSAL', 'MESIAL'] }
      ]
    });

    const fp2 = computeOdontogramBatchFingerprint({
      requestId: '00000000-0000-0000-0000-000000000001',
      action: 'CREATE_FINDING',
      findingType: 'CARIES',
      encounterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      notes: 'Nota de lote',
      items: [
        { toothNumber: 14, surfaces: ['MESIAL', 'OCCLUSAL'] },
        { toothNumber: 15, surfaces: ['OCCLUSAL', 'DISTAL'] }
      ]
    });

    assert.strictEqual(fp1, fp2, 'Fingerprints deben ser idénticos tras canonicalización');
  });

  await t.test('H1. Concurrencia / P2002 del ledger con constraintName real devuelve resultado previo sin duplicar', async () => {
    const reqId = 'h1eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
    const payload = {
      requestId: reqId,
      action: 'CREATE_FINDING' as const,
      findingType: 'CARIES' as const,
      items: [{ toothNumber: 14, surfaces: ['OCCLUSAL' as const] }]
    };

    const fingerprint = computeOdontogramBatchFingerprint(payload);

    const initialBatchRequests = [
      {
        id: 'ledger-winner-1',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        requestId: reqId,
        requestFingerprint: fingerprint,
        action: 'CREATE_FINDING',
        createdByMembershipId: 'mem-prof',
        createdAt: new Date()
      }
    ];

    const initialFindings = [
      {
        id: 'finding-winner-1',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 14,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL'],
        status: 'ACTIVE',
        version: 1,
        sourceRequestId: reqId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: { id: 'mem-prof', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
      }
    ];

    const mock = createMockPrisma({
      $transaction: async () => {
        throw new PrismaNamespace.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`clinicId`,`patientId`,`requestId`)',
          {
            code: 'P2002',
            clientVersion: '1',
            meta: { target: ['OdontogramBatchRequest_clinicId_patientId_requestId_key'] }
          }
        );
      }
    }, initialFindings, [], initialBatchRequests);

    const service = new OdontogramService(mock);

    const result = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', payload);

    assert.strictEqual(result.appliedCount, 1);
    assert.strictEqual(result.findings[0]?.id, 'finding-winner-1');
  });

  await t.test('H2. Concurrencia / P2002 con target array de campos [clinicId, patientId, requestId] devuelve resultado previo', async () => {
    const reqId = 'h2eebc99-9c0b-4ef8-bb6d-6bb9bd380a56';
    const payload = {
      requestId: reqId,
      action: 'CREATE_FINDING' as const,
      findingType: 'CARIES' as const,
      items: [{ toothNumber: 14, surfaces: ['OCCLUSAL' as const] }]
    };

    const fingerprint = computeOdontogramBatchFingerprint(payload);

    const initialBatchRequests = [
      {
        id: 'ledger-winner-2',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        requestId: reqId,
        requestFingerprint: fingerprint,
        action: 'CREATE_FINDING',
        createdByMembershipId: 'mem-prof',
        createdAt: new Date()
      }
    ];

    const initialFindings = [
      {
        id: 'finding-winner-2',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        toothNumber: 14,
        findingType: 'CARIES',
        surfaces: ['OCCLUSAL'],
        status: 'ACTIVE',
        version: 1,
        sourceRequestId: reqId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: { id: 'mem-prof', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
      }
    ];

    const mock = createMockPrisma({
      $transaction: async () => {
        throw new PrismaNamespace.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`clinicId`,`patientId`,`requestId`)',
          {
            code: 'P2002',
            clientVersion: '1',
            meta: { target: ['clinicId', 'patientId', 'requestId'] }
          }
        );
      }
    }, initialFindings, [], initialBatchRequests);

    const service = new OdontogramService(mock);

    const result = await service.applyBatch('clinic-1', 'pat-1', 'mem-prof', payload);

    assert.strictEqual(result.appliedCount, 1);
    assert.strictEqual(result.findings[0]?.id, 'finding-winner-2');
  });

  await t.test('I. Concurrencia / P2002 con fingerprint distinto lanza 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const reqId = 'i1eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';

    const initialBatchRequests = [
      {
        id: 'ledger-winner-1',
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        requestId: reqId,
        requestFingerprint: 'different-fingerprint-from-winner',
        action: 'CREATE_FINDING',
        createdByMembershipId: 'mem-prof',
        createdAt: new Date()
      }
    ];

    const mock = createMockPrisma({
      $transaction: async () => {
        throw new PrismaNamespace.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`clinicId`,`patientId`,`requestId`)',
          {
            code: 'P2002',
            clientVersion: '1',
            meta: { target: ['OdontogramBatchRequest_clinicId_patientId_requestId_key'] }
          }
        );
      }
    }, [], [], initialBatchRequests);

    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: reqId,
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [{ toothNumber: 14, surfaces: ['OCCLUSAL'] }]
      }),
      (err: any) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 409
    );
  });

  await t.test('J1. P2002 con target ajeno [someOtherUniqueField] se propaga sin recovery', async () => {
    const reqId = 'j1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77';

    const mock = createMockPrisma({
      $transaction: async () => {
        throw new PrismaNamespace.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`someOtherUniqueField`)',
          {
            code: 'P2002',
            clientVersion: '1',
            meta: { target: ['someOtherUniqueField'] }
          }
        );
      }
    });

    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: reqId,
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [{ toothNumber: 14, surfaces: ['OCCLUSAL'] }]
      }),
      (err: any) => {
        return (
          err instanceof PrismaNamespace.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as any)?.[0] === 'someOtherUniqueField'
        );
      }
    );

    assert.strictEqual(mock._getNewlyCreatedFindings().length, 0);
    assert.strictEqual(mock._getAuditEvents().length, 0);
  });

  await t.test('J2. P2002 con target array solo [requestId] se propaga sin recovery', async () => {
    const reqId = 'j2eebc99-9c0b-4ef8-bb6d-6bb9bd380a78';

    const mock = createMockPrisma({
      $transaction: async () => {
        throw new PrismaNamespace.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`requestId`)',
          {
            code: 'P2002',
            clientVersion: '1',
            meta: { target: ['requestId'] }
          }
        );
      }
    });

    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: reqId,
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [{ toothNumber: 14, surfaces: ['OCCLUSAL'] }]
      }),
      (err: any) => {
        return (
          err instanceof PrismaNamespace.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as any)?.[0] === 'requestId'
        );
      }
    );

    assert.strictEqual(mock._getNewlyCreatedFindings().length, 0);
    assert.strictEqual(mock._getAuditEvents().length, 0);
  });

  await t.test('J3. P2002 con target string requestId se propaga sin recovery', async () => {
    const reqId = 'j3eebc99-9c0b-4ef8-bb6d-6bb9bd380a79';

    const mock = createMockPrisma({
      $transaction: async () => {
        throw new PrismaNamespace.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`requestId`)',
          {
            code: 'P2002',
            clientVersion: '1',
            meta: { target: 'requestId' }
          }
        );
      }
    });

    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: reqId,
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [{ toothNumber: 14, surfaces: ['OCCLUSAL'] }]
      }),
      (err: any) => {
        return (
          err instanceof PrismaNamespace.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          err.meta?.target === 'requestId'
        );
      }
    );

    assert.strictEqual(mock._getNewlyCreatedFindings().length, 0);
    assert.strictEqual(mock._getAuditEvents().length, 0);
  });

  await t.test('J4. P2002 con target array parcial [clinicId, requestId] se propaga sin recovery', async () => {
    const reqId = 'j4eebc99-9c0b-4ef8-bb6d-6bb9bd380a80';

    const mock = createMockPrisma({
      $transaction: async () => {
        throw new PrismaNamespace.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`clinicId`,`requestId`)',
          {
            code: 'P2002',
            clientVersion: '1',
            meta: { target: ['clinicId', 'requestId'] }
          }
        );
      }
    });

    const service = new OdontogramService(mock);

    await assert.rejects(
      service.applyBatch('clinic-1', 'pat-1', 'mem-prof', {
        requestId: reqId,
        action: 'CREATE_FINDING',
        findingType: 'CARIES',
        items: [{ toothNumber: 14, surfaces: ['OCCLUSAL'] }]
      }),
      (err: any) => {
        return (
          err instanceof PrismaNamespace.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as any)?.[0] === 'clinicId'
        );
      }
    );

    assert.strictEqual(mock._getNewlyCreatedFindings().length, 0);
    assert.strictEqual(mock._getAuditEvents().length, 0);
  });
});

test('Odontogram V1.1 — Domain Helpers Parity & DTO Strictness', async (t) => {
  await t.test('K. ToothAssessment DTO jamás fabrica fechas ni identidades actuales ante datos inválidos', async () => {
    const mock = createMockPrisma();
    const service = new OdontogramService(mock);

    // Invalid assessedAt
    assert.throws(
      () => {
        (service as any).mapToAssessmentItemDto({
          id: 'a-1',
          toothNumber: 11,
          assessmentType: 'HEALTHY',
          assessedAt: 'fecha-invalida',
          createdAt: new Date(),
          assessedBy: { id: 'mem-1', role: 'PROFESSIONAL', name: 'Dr A' }
        });
      },
      (err: any) => err.code === 'INTERNAL_ERROR' && err.statusCode === 500
    );

    // Missing assessedBy
    assert.throws(
      () => {
        (service as any).mapToAssessmentItemDto({
          id: 'a-1',
          toothNumber: 11,
          assessmentType: 'HEALTHY',
          assessedAt: new Date(),
          createdAt: new Date(),
          assessedBy: null
        });
      },
      (err: any) => err.code === 'INTERNAL_ERROR' && err.statusCode === 500
    );
  });

  await t.test('L. Helper de conflictos produce resultados idénticos para V1 y batch', () => {
    const activeFindings = [
      { findingType: 'MISSING', surfaces: ['WHOLE_TOOTH'] }
    ];

    // MISSING blocks CARIES
    const conflict1 = evaluateActiveFindingConflicts(16, 'CARIES', ['OCCLUSAL'], activeFindings);
    assert.ok(conflict1);
    assert.strictEqual(conflict1.conflictCode, 'DENTAL_FINDING_INCOMPATIBLE');

    // Duplicate detection
    const activeCaries = [
      { findingType: 'CARIES', surfaces: ['OCCLUSAL', 'MESIAL'] }
    ];
    const conflict2 = evaluateActiveFindingConflicts(16, 'CARIES', ['MESIAL', 'OCCLUSAL'], activeCaries);
    assert.ok(conflict2);
    assert.strictEqual(conflict2.conflictCode, 'DENTAL_FINDING_ALREADY_EXISTS');

    // Assessment conflict
    const conflict3 = evaluateActiveAssessmentConflicts(16, 'HEALTHY', activeCaries);
    assert.ok(conflict3);
    assert.strictEqual(conflict3.conflictCode, 'DENTAL_FINDING_INCOMPATIBLE');
  });

  await t.test('M. getOdontogram incluye solo currentlyHealthy y latestHealthyAssessedAt; getToothDetail incluye assessments[] completos', async () => {
    const mock = createMockPrisma(
      {},
      [],
      [
        {
          id: 'assess-1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          toothNumber: 11,
          assessmentType: 'HEALTHY',
          notes: 'Nota privada longitudinal',
          encounterId: 'enc-1',
          sourceRequestId: 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          assessedAt: new Date('2026-08-30T12:00:00.000Z'),
          createdAt: new Date('2026-08-30T12:00:00.000Z'),
          assessedBy: { id: 'mem-prof', role: 'PROFESSIONAL', user: { firstName: 'Dra', lastName: 'Ana' } }
        }
      ]
    );
    const service = new OdontogramService(mock);

    const general = await service.getOdontogram('clinic-1', 'pat-1', 'mem-prof');
    assert.strictEqual(general.summary.healthyTeethCount, 1);
    const tooth11General = general.teeth[11];
    assert.ok(tooth11General);
    assert.strictEqual(tooth11General.currentlyHealthy, true);
    assert.strictEqual(tooth11General.latestHealthyAssessedAt, '2026-08-30T12:00:00.000Z');
    assert.strictEqual((tooth11General as any).notes, undefined);
    assert.strictEqual((tooth11General as any).assessedBy, undefined);
    assert.strictEqual((tooth11General as any).assessments, undefined);

    const detail = await service.getToothDetail('clinic-1', 'pat-1', 11, 'mem-prof');
    assert.strictEqual(detail.currentlyHealthy, true);
    assert.strictEqual(detail.assessments.length, 1);
    assert.strictEqual(detail.assessments[0]?.id, 'assess-1');
    assert.strictEqual(detail.assessments[0]?.notes, 'Nota privada longitudinal');
    assert.deepStrictEqual(detail.assessments[0]?.assessedBy, {
      id: 'mem-prof',
      role: 'PROFESSIONAL',
      name: 'Dra Ana'
    });
  });
});

test('Odontogram V1.1 — Error Handler & AppError Details Serialization', async (t) => {
  await t.test('errorHandler serializa details cuando están presentes en AppError', () => {
    let capturedStatus = 0;
    let capturedJson: any = null;

    const mockRes: any = {
      status: (s: number) => {
        capturedStatus = s;
        return mockRes;
      },
      json: (j: any) => {
        capturedJson = j;
        return mockRes;
      }
    };

    const error = new AppError('BATCH_VALIDATION_FAILED', 'Errores en lote', 409, {
      failures: [{ index: 0, toothNumber: 16, reasonCode: 'DENTAL_FINDING_INCOMPATIBLE', reasonMessage: 'Incompatible' }]
    });

    errorHandler(error, {} as any, mockRes, (() => {}) as any);

    assert.strictEqual(capturedStatus, 409);
    assert.deepStrictEqual(capturedJson, {
      error: {
        code: 'BATCH_VALIDATION_FAILED',
        message: 'Errores en lote',
        details: {
          failures: [{ index: 0, toothNumber: 16, reasonCode: 'DENTAL_FINDING_INCOMPATIBLE', reasonMessage: 'Incompatible' }]
        }
      }
    });
  });

  await t.test('errorHandler no incluye key details cuando details es undefined en AppError', () => {
    let capturedStatus = 0;
    let capturedJson: any = null;

    const mockRes: any = {
      status: (s: number) => {
        capturedStatus = s;
        return mockRes;
      },
      json: (j: any) => {
        capturedJson = j;
        return mockRes;
      }
    };

    const error = new AppError('NOT_FOUND', 'No encontrado', 404);

    errorHandler(error, {} as any, mockRes, (() => {}) as any);

    assert.strictEqual(capturedStatus, 404);
    assert.deepStrictEqual(capturedJson, {
      error: {
        code: 'NOT_FOUND',
        message: 'No encontrado'
      }
    });
    assert.strictEqual('details' in capturedJson.error, false);
  });
});
