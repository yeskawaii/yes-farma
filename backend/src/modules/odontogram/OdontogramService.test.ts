import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma as PrismaNamespace } from '../../generated/prisma';
import { OdontogramService } from './application/OdontogramService';
import {
  createDentalFindingSchema,
  resolveDentalFindingSchema,
  cancelDentalFindingSchema,
  WHOLE_TOOTH_ONLY_FINDING_TYPES,
  SURFACE_ORIENTED_FINDING_TYPES
} from './domain/OdontogramSchema';

const createMockPrisma = (overrides: any = {}) => {
  let createdFindings: any[] = [];
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
          list = list.filter((f) => f.toothNumber === args.where.toothNumber);
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
