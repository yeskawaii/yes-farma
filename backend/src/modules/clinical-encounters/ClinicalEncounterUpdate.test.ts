import test from 'node:test';
import assert from 'node:assert/strict';
import { updateClinicalEncounterSchema } from './domain/ClinicalEncounterSchema';
import { ClinicalEncounterService, IClinicalEncounterRepository, IPrismaTxEncounter } from './application/ClinicalEncounterService';
import { AppError } from '../../shared/errors/AppError';
import { Prisma } from '../../generated/prisma';
import { clinicalEncounterRoutes } from './infrastructure/clinicalEncounterRoutes';

type ClinicalEncounterMockMethods = {
  findFirst?: (args?: Prisma.ClinicalEncounterFindFirstArgs) => Promise<unknown>;
  updateMany?: (args: Prisma.ClinicalEncounterUpdateManyArgs) => Promise<{ count: number }>;
};

type ClinicalVitalSignsMockMethods = {
  deleteMany?: (args?: Prisma.ClinicalVitalSignsDeleteManyArgs) => Promise<{ count: number }>;
  findUnique?: (args: Prisma.ClinicalVitalSignsFindUniqueArgs) => Promise<{ measuredAt: Date } | null>;
  upsert?: (args: Prisma.ClinicalVitalSignsUpsertArgs) => Promise<unknown>;
  count?: (args?: Prisma.ClinicalVitalSignsCountArgs) => Promise<number>;
};

type ClinicalDiagnosisMockMethods = {
  deleteMany?: (args?: Prisma.ClinicalDiagnosisDeleteManyArgs) => Promise<{ count: number }>;
  createMany?: (args: Prisma.ClinicalDiagnosisCreateManyArgs) => Promise<{ count: number }>;
  count?: (args?: Prisma.ClinicalDiagnosisCountArgs) => Promise<number>;
};

type ClinicalProcedureMockMethods = {
  deleteMany?: (args?: Prisma.ClinicalProcedureDeleteManyArgs) => Promise<{ count: number }>;
  createMany?: (args: Prisma.ClinicalProcedureCreateManyArgs) => Promise<{ count: number }>;
  count?: (args?: Prisma.ClinicalProcedureCountArgs) => Promise<number>;
};

type AuditEventMockMethods = {
  create?: (args: Prisma.AuditEventCreateArgs) => Promise<unknown>;
};

type MockRepositoryOverrides = {
  clinicalEncounter?: ClinicalEncounterMockMethods;
  clinicalVitalSigns?: ClinicalVitalSignsMockMethods;
  clinicalDiagnosis?: ClinicalDiagnosisMockMethods;
  clinicalProcedure?: ClinicalProcedureMockMethods;
  auditEvent?: AuditEventMockMethods;
  $transaction?: IClinicalEncounterRepository['$transaction'];
};

const createMockPrisma = (overrides: MockRepositoryOverrides = {}): IClinicalEncounterRepository => {
  const clinicalEncounterMethods = {
    findFirst: async () => ({ id: 'enc-1', status: 'DRAFT', version: 1, professionalMembershipId: 'm1', occurredAt: new Date() }),
    updateMany: async () => ({ count: 1 }),
    ...overrides.clinicalEncounter
  };

  const clinicalVitalSignsMethods = {
    deleteMany: async () => ({ count: 0 }),
    findUnique: async () => null,
    upsert: async () => ({}),
    count: async () => 0,
    ...overrides.clinicalVitalSigns
  };

  const clinicalDiagnosisMethods = {
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 1 }),
    count: async () => 0,
    ...overrides.clinicalDiagnosis
  };

  const clinicalProcedureMethods = {
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 1 }),
    count: async () => 0,
    ...overrides.clinicalProcedure
  };

  const auditEventMethods = {
    create: async () => ({ id: 'audit-1' }),
    ...overrides.auditEvent
  };

  const repository: IClinicalEncounterRepository = {
    clinicalEncounter: clinicalEncounterMethods as unknown as IClinicalEncounterRepository['clinicalEncounter'],
    clinicalVitalSigns: clinicalVitalSignsMethods as unknown as IClinicalEncounterRepository['clinicalVitalSigns'],
    clinicalDiagnosis: clinicalDiagnosisMethods as unknown as IClinicalEncounterRepository['clinicalDiagnosis'],
    clinicalProcedure: clinicalProcedureMethods as unknown as IClinicalEncounterRepository['clinicalProcedure'],
    auditEvent: auditEventMethods as unknown as IClinicalEncounterRepository['auditEvent'],
    patient: {} as IClinicalEncounterRepository['patient'],
    membership: {} as IClinicalEncounterRepository['membership'],
    appointment: {} as IClinicalEncounterRepository['appointment'],
    $transaction: overrides.$transaction || (async <T>(cb: (tx: IPrismaTxEncounter) => Promise<T>): Promise<T> => {
      return cb(repository as unknown as IPrismaTxEncounter);
    })
  };

  return repository;
};

const safeDetailFixture = {
  id: 'e1',
  occurredAt: new Date(),
  status: 'DRAFT' as const,
  version: 1,
  reasonForVisit: null,
  relevantHistory: null,
  allergies: null,
  currentMedications: null,
  physicalExamination: null,
  indications: null,
  clinicalNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  finalizedAt: null,
  patient: { id: 'p1', displayName: 'a b', birthDate: new Date(), sexAtBirth: null },
  professional: { displayName: 'c d' },
  finalizedBy: null,
  appointment: null,
  vitalSigns: null,
  diagnoses: [],
  procedures: [],
  amendments: []
};

const stubSafeDetail = (service: ClinicalEncounterService): void => {
  service.getEncounterById = async () => safeDetailFixture;
};

test('ClinicalEncounter Update', async (t) => {
  await t.test('Schemas', async (sub) => {
    await sub.test('1. version obligatorio', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ reasonForVisit: 'test' }), /Required/);
    });
    await sub.test('2. version >= 1', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 0, reasonForVisit: 'test' }), /version must be >= 1/);
    });
    await sub.test('3. rechaza body sin mutaciones', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1 }), /Body must contain at least one mutation/);
    });
    await sub.test('4. rechaza clinicId', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, reasonForVisit: 'test', clinicId: 'c1' }), /Unrecognized key/);
    });
    await sub.test('5. rechaza patientId', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, reasonForVisit: 'test', patientId: 'p1' }), /Unrecognized key/);
    });
    await sub.test('6. rechaza appointmentId', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, reasonForVisit: 'test', appointmentId: 'a1' }), /Unrecognized key/);
    });
    await sub.test('7. rechaza professionalMembershipId', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, reasonForVisit: 'test', professionalMembershipId: 'm1' }), /Unrecognized key/);
    });
    await sub.test('8. fecha sin Z u offset se rechaza', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, occurredAt: '2026-08-04T10:00:00' }), /Invalid ISO 8601/);
    });
    await sub.test('9. cadenas respetan límites', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, reasonForVisit: 'a'.repeat(5001) }), /String must contain at most/);
    });
    await sub.test('10. cadena vacía aplica la política elegida (null)', () => {
      const parsed = updateClinicalEncounterSchema.parse({ version: 1, reasonForVisit: '   ' });
      assert.strictEqual(parsed.reasonForVisit, null);
    });
    await sub.test('vitalSigns rechaza una propiedad id', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, vitalSigns: { id: 'v1', heartRate: 80 } as unknown }), /Unrecognized key/);
    });
    await sub.test('diagnosis rechaza una propiedad encounterId', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, diagnoses: [{ description: 'd1', encounterId: 'e1' } as unknown] }), /Unrecognized key/);
    });
    await sub.test('procedure rechaza una propiedad clinicId', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, procedures: [{ description: 'p1', clinicId: 'c1' } as unknown] }), /Unrecognized key/);
    });
    await sub.test('oxygenSaturationPercent decimal se rechaza', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, vitalSigns: { oxygenSaturationPercent: 98.5 } }), /Expected integer/);
    });
    await sub.test('heightCm decimal se rechaza', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, vitalSigns: { heightCm: 175.5 } }), /Expected integer/);
    });
    await sub.test('una fecha ISO con Z pero calendario imposible se rechaza', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, occurredAt: '2026-99-99T10:00:00Z' }), /be a valid date/);
    });
    await sub.test('rechaza 2026-02-30T10:00:00Z (día imposible)', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, occurredAt: '2026-02-30T10:00:00Z' }), /be a valid date/);
    });
    await sub.test('rechaza 2025-02-29T10:00:00Z (año no bisiesto)', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, occurredAt: '2025-02-29T10:00:00Z' }), /be a valid date/);
    });
    await sub.test('acepta 2024-02-29T10:00:00Z (año bisiesto)', () => {
      const res = updateClinicalEncounterSchema.parse({ version: 1, occurredAt: '2024-02-29T10:00:00Z' });
      assert.strictEqual(res.occurredAt, '2024-02-29T10:00:00Z');
    });
    await sub.test('rechaza hora 25', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, occurredAt: '2026-01-01T25:00:00Z' }), /be a valid date/);
    });
    await sub.test('rechaza offset inválido', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, occurredAt: '2026-01-01T10:00:00+25:00' }), /be a valid date/);
    });
  });

  await t.test('Permisos y estado', async (sub) => {
    await sub.test('11. ASSISTANT recibe 403', async () => {
      const svc = new ClinicalEncounterService(createMockPrisma());
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'ASSISTANT', { version: 1, reasonForVisit: 'test' }), (err: unknown) => err instanceof AppError && err.code === 'FORBIDDEN');
    });
    await sub.test('12. sin authContext no obtiene acceso', async () => {
      const layers = clinicalEncounterRoutes.stack;
      const authIndex = layers.findIndex((l: unknown) => (l as Record<string, unknown>).name === 'authMiddleware');
      const patchIndex = layers.findIndex((l: unknown) => (l as Record<string, unknown>).route && ((l as Record<string, unknown>).route as Record<string, unknown>).path === '/:id' && (((l as Record<string, unknown>).route as Record<string, unknown>).methods as Record<string, boolean>).patch);
      assert.ok(authIndex !== -1, 'authMiddleware debe estar registrado');
      assert.ok(patchIndex !== -1, 'ruta PATCH debe estar registrada');
      assert.ok(authIndex < patchIndex, 'authMiddleware debe registrarse antes de PATCH');
    });
    await sub.test('13. otro tenant devuelve 404', async () => {
      const prisma = createMockPrisma({ clinicalEncounter: { findFirst: async () => null } });
      const svc = new ClinicalEncounterService(prisma);
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' }), (err: unknown) => err instanceof AppError && err.code === 'NOT_FOUND');
    });
    await sub.test('14. OWNER responsable puede editar', async () => {
      const svc = new ClinicalEncounterService(createMockPrisma());
      stubSafeDetail(svc);
      const res = await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'OWNER', { version: 1, reasonForVisit: 'test' });
      assert.strictEqual(res.id, 'e1');
    });
    await sub.test('15. PROFESSIONAL responsable puede editar', async () => {
      const svc = new ClinicalEncounterService(createMockPrisma());
      stubSafeDetail(svc);
      const res = await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' });
      assert.strictEqual(res.id, 'e1');
    });
    await sub.test('16. OWNER no responsable recibe 403', async () => {
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: { findFirst: async () => ({ professionalMembershipId: 'other', status: 'DRAFT' }) } }));
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'OWNER', { version: 1, reasonForVisit: 'test' }), (err: unknown) => err instanceof AppError && err.code === 'FORBIDDEN');
    });
    await sub.test('17. PROFESSIONAL no responsable recibe 403', async () => {
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: { findFirst: async () => ({ professionalMembershipId: 'other', status: 'DRAFT' }) } }));
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' }), (err: unknown) => err instanceof AppError && err.code === 'FORBIDDEN');
    });
    await sub.test('18. FINALIZED devuelve CLINICAL_ENCOUNTER_FINALIZED', async () => {
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: { findFirst: async () => ({ professionalMembershipId: 'm1', status: 'FINALIZED' }) } }));
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' }), (err: unknown) => err instanceof AppError && err.code === 'CLINICAL_ENCOUNTER_FINALIZED');
    });
  });

  await t.test('Concurrencia', async (sub) => {
    await sub.test('19. version incorrecta devuelve conflicto (findFirst check)', async () => {
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: { findFirst: async () => ({ professionalMembershipId: 'm1', status: 'DRAFT', version: 2 }) } }));
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' }), (err: unknown) => err instanceof AppError && err.code === 'CLINICAL_ENCOUNTER_VERSION_CONFLICT');
    });
    await sub.test('20. actualización usa filtro atómico con version', async () => {
      let updateArgs: Prisma.ClinicalEncounterUpdateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: {
        findFirst: async () => ({ id: 'e1', professionalMembershipId: 'm1', status: 'DRAFT', version: 1 }),
        updateMany: async (args: Prisma.ClinicalEncounterUpdateManyArgs) => { updateArgs = args; return { count: 1 }; }
      } }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' });
      assert.ok(updateArgs);
      const updateWhere = updateArgs.where;
      assert.ok(updateWhere);
      assert.strictEqual(updateWhere.version, 1);
    });
    await sub.test('21. version incrementa exactamente una vez', async () => {
      let updateArgs: Prisma.ClinicalEncounterUpdateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: {
        findFirst: async () => ({ id: 'e1', professionalMembershipId: 'm1', status: 'DRAFT', version: 1 }),
        updateMany: async (args: Prisma.ClinicalEncounterUpdateManyArgs) => { updateArgs = args; return { count: 1 }; }
      } }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' });
      assert.ok(updateArgs);
      assert.deepEqual(updateArgs.data.version, { increment: 1 });
    });
    await sub.test('22. updatedByMembershipId usa authContext', async () => {
      let updateArgs: Prisma.ClinicalEncounterUpdateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: {
        findFirst: async () => ({ id: 'e1', professionalMembershipId: 'm1', status: 'DRAFT', version: 1 }),
        updateMany: async (args: Prisma.ClinicalEncounterUpdateManyArgs) => { updateArgs = args; return { count: 1 }; }
      } }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' });
      assert.ok(updateArgs);
      assert.strictEqual(updateArgs.data.updatedByMembershipId, 'm1');
    });
    await sub.test('23. dos actualizaciones con misma version no pueden ganar ambas', async () => {
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: {
        findFirst: async () => ({ id: 'e1', professionalMembershipId: 'm1', status: 'DRAFT', version: 1 }),
        updateMany: async () => ({ count: 0 })
      } }));
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' }), (err: unknown) => err instanceof AppError && err.code === 'CLINICAL_ENCOUNTER_VERSION_CONFLICT');
    });
    await sub.test('24. P2034 reintenta máximo tres veces', async () => {
      let attempts = 0;
      const svc = new ClinicalEncounterService(createMockPrisma({
        $transaction: async () => { attempts++; throw new Prisma.PrismaClientKnownRequestError('Concurrent', { code: 'P2034', clientVersion: '1' }); }
      }));
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' }), (err: unknown) => err instanceof AppError && err.code === 'CONCURRENCY_ERROR');
      assert.strictEqual(attempts, 3);
    });
    await sub.test('25. otros errores no se reintentan', async () => {
      let attempts = 0;
      const svc = new ClinicalEncounterService(createMockPrisma({
        $transaction: async () => { attempts++; throw new Error('Generic'); }
      }));
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' }));
      assert.strictEqual(attempts, 1);
    });
  });

  await t.test('Narrativa', async (sub) => {
    await sub.test('26. actualiza campos narrativos', async () => {
      let updateArgs: Prisma.ClinicalEncounterUpdateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: {
        findFirst: async () => ({ id: 'e1', professionalMembershipId: 'm1', status: 'DRAFT', version: 1 }),
        updateMany: async (args: Prisma.ClinicalEncounterUpdateManyArgs) => { updateArgs = args; return { count: 1 }; }
      } }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'new reason' });
      assert.ok(updateArgs);
      assert.strictEqual(updateArgs.data.reasonForVisit, 'new reason');
    });
    await sub.test('27. permite limpiar un campo con null', async () => {
      let updateArgs: Prisma.ClinicalEncounterUpdateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: {
        findFirst: async () => ({ id: 'e1', professionalMembershipId: 'm1', status: 'DRAFT', version: 1 }),
        updateMany: async (args: Prisma.ClinicalEncounterUpdateManyArgs) => { updateArgs = args; return { count: 1 }; }
      } }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: null });
      assert.ok(updateArgs);
      assert.strictEqual(updateArgs.data.reasonForVisit, null);
    });
    await sub.test('28. no modifica campos omitidos', async () => {
      let updateArgs: Prisma.ClinicalEncounterUpdateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: {
        findFirst: async () => ({ id: 'e1', professionalMembershipId: 'm1', status: 'DRAFT', version: 1 }),
        updateMany: async (args: Prisma.ClinicalEncounterUpdateManyArgs) => { updateArgs = args; return { count: 1 }; }
      } }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' });
      assert.ok(updateArgs);
      assert.strictEqual(updateArgs.data.clinicalNotes, undefined);
    });
    await sub.test('29. occurredAt se actualiza correctamente', async () => {
      let updateArgs: Prisma.ClinicalEncounterUpdateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({ clinicalEncounter: {
        findFirst: async () => ({ id: 'e1', professionalMembershipId: 'm1', status: 'DRAFT', version: 1 }),
        updateMany: async (args: Prisma.ClinicalEncounterUpdateManyArgs) => { updateArgs = args; return { count: 1 }; }
      } }));
      stubSafeDetail(svc);
      const date = '2026-08-05T10:00:00Z';
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, occurredAt: date });
      assert.ok(updateArgs);
      assert.strictEqual((updateArgs.data.occurredAt as Date).toISOString(), new Date(date).toISOString());
    });
  });

  await t.test('Signos vitales', async (sub) => {
    await sub.test('30. crea signos vitales si no existen', async () => {
      let upsertArgs: Prisma.ClinicalVitalSignsUpsertArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalVitalSigns: { upsert: async (args: Prisma.ClinicalVitalSignsUpsertArgs) => { upsertArgs = args; return {}; }, findUnique: async () => null }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, vitalSigns: { heartRate: 80 } });
      assert.ok(upsertArgs);
      assert.strictEqual(upsertArgs.create.heartRate, 80);
      assert.strictEqual(upsertArgs.update.heartRate, 80);
    });
    await sub.test('31. reemplaza signos vitales existentes', async () => {
      let upsertArgs: Prisma.ClinicalVitalSignsUpsertArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalVitalSigns: { upsert: async (args: Prisma.ClinicalVitalSignsUpsertArgs) => { upsertArgs = args; return {}; }, findUnique: async () => ({ measuredAt: new Date() }) }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, vitalSigns: { heartRate: 80 } });
      assert.ok(upsertArgs);
      assert.strictEqual(upsertArgs.update.systolicBloodPressure, null);
      assert.strictEqual(upsertArgs.update.heartRate, 80);
    });
    await sub.test('32. null elimina signos vitales', async () => {
      let deleteCalled = false;
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalVitalSigns: { deleteMany: async () => { deleteCalled = true; return { count: 1 }; } }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, vitalSigns: null });
      assert.ok(deleteCalled);
    });
    await sub.test('33. objeto vacío se rechaza (schema)', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, vitalSigns: {} }), /At least one clinical value must be provided/);
    });
    await sub.test('34. sistólica <= diastólica se rechaza (schema)', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, vitalSigns: { systolicBloodPressure: 80, diastolicBloodPressure: 90 } }), /Systolic must be greater than diastolic/);
    });
    await sub.test('35. límites numéricos se validan (schema)', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, vitalSigns: { heartRate: 400 } }), /Number must be less than or equal to 300/);
    });
    await sub.test('36. measuredAt se conserva si se omite y ya existía', async () => {
      let upsertArgs: Prisma.ClinicalVitalSignsUpsertArgs | undefined;
      const d = new Date('2026-08-01T10:00:00Z');
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalVitalSigns: { upsert: async (args: Prisma.ClinicalVitalSignsUpsertArgs) => { upsertArgs = args; return {}; }, findUnique: async () => ({ measuredAt: d }) }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, vitalSigns: { heartRate: 80 } });
      assert.ok(upsertArgs);
      assert.strictEqual((upsertArgs.update.measuredAt as Date).toISOString(), d.toISOString());
    });
  });

  await t.test('Diagnósticos y Procedimientos', async (sub) => {
    await sub.test('37. reemplaza diagnósticos completos', async () => {
      let createdArgs: Prisma.ClinicalDiagnosisCreateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalDiagnosis: { deleteMany: async () => ({ count: 0 }), createMany: async (args: Prisma.ClinicalDiagnosisCreateManyArgs) => { createdArgs = args; return { count: 1 }; } }
      }));
      stubSafeDetail(svc);
      const input = updateClinicalEncounterSchema.parse({ version: 1, diagnoses: [{ description: 'd1' }] });
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', input);
      assert.ok(createdArgs);
      const rows = Array.isArray(createdArgs.data) ? createdArgs.data : [createdArgs.data];
      assert.strictEqual(rows[0]?.description, 'd1');
      assert.strictEqual(rows[0]?.sortOrder, 0);
    });
    await sub.test('38. arreglo vacío elimina todos', async () => {
      let deleteCalled = false;
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalDiagnosis: { deleteMany: async () => { deleteCalled = true; return { count: 1 }; } }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, diagnoses: [] });
      assert.ok(deleteCalled);
    });
    await sub.test('39. más de un diagnóstico principal se rechaza (schema)', () => {
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, diagnoses: [{ description: '1', isPrimary: true }, { description: '2', isPrimary: true }] }), /Only one primary diagnosis is allowed/);
    });
    await sub.test('40. más de 50 se rechaza (schema)', () => {
      const arr = Array(51).fill({ description: 'd' });
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, diagnoses: arr }), /Array must contain at most 50 element\(s\)/);
    });
    await sub.test('41. sortOrder omitido usa índice', async () => {
      let createdArgs: Prisma.ClinicalDiagnosisCreateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalDiagnosis: { deleteMany: async () => ({ count: 0 }), createMany: async (args: Prisma.ClinicalDiagnosisCreateManyArgs) => { createdArgs = args; return { count: 1 }; } }
      }));
      stubSafeDetail(svc);
      const input = updateClinicalEncounterSchema.parse({ version: 1, diagnoses: [{ description: 'd1' }, { description: 'd2' }] });
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', input);
      assert.ok(createdArgs);
      const rows = Array.isArray(createdArgs.data) ? createdArgs.data : [createdArgs.data];
      assert.strictEqual(rows[0]?.sortOrder, 0);
      assert.strictEqual(rows[1]?.sortOrder, 1);
    });
    await sub.test('42. reemplaza procedimientos completos', async () => {
      let createdArgs: Prisma.ClinicalDiagnosisCreateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalProcedure: { deleteMany: async () => ({ count: 0 }), createMany: async (args: Prisma.ClinicalProcedureCreateManyArgs) => { createdArgs = args; return { count: 1 }; } }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, procedures: [{ description: 'p1' }] });
      assert.ok(createdArgs);
      const rows = Array.isArray(createdArgs.data) ? createdArgs.data : [createdArgs.data];
      assert.strictEqual(rows[0]?.description, 'p1');
    });
    await sub.test('43. arreglo vacío elimina todos', async () => {
      let deleteCalled = false;
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalProcedure: { deleteMany: async () => { deleteCalled = true; return { count: 1 }; } }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, procedures: [] });
      assert.ok(deleteCalled);
    });
    await sub.test('44. más de 50 se rechaza (schema)', () => {
      const arr = Array(51).fill({ description: 'p' });
      assert.throws(() => updateClinicalEncounterSchema.parse({ version: 1, procedures: arr }), /Array must contain at most 50 element\(s\)/);
    });
    await sub.test('45. sortOrder omitido usa índice', async () => {
      let createdArgs: Prisma.ClinicalDiagnosisCreateManyArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalProcedure: { deleteMany: async () => ({ count: 0 }), createMany: async (args: Prisma.ClinicalProcedureCreateManyArgs) => { createdArgs = args; return { count: 1 }; } }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, procedures: [{ description: 'p1' }, { description: 'p2' }] });
      assert.ok(createdArgs);
      const rows = Array.isArray(createdArgs.data) ? createdArgs.data : [createdArgs.data];
      assert.strictEqual(rows[0]?.sortOrder, 0);
      assert.strictEqual(rows[1]?.sortOrder, 1);
    });
  });

  await t.test('Auditoría y respuesta', async (sub) => {
    await sub.test('46. crea CLINICAL_ENCOUNTER_UPDATED', async () => {
      let auditArgs: Prisma.AuditEventCreateArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({
        auditEvent: { create: async (args: Prisma.AuditEventCreateArgs) => { auditArgs = args; return { id: 'a1' }; } }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' });
      assert.ok(auditArgs);
      assert.strictEqual(auditArgs.data.action, 'CLINICAL_ENCOUNTER_UPDATED');
    });
    await sub.test('47. metadata no contiene contenido clínico', async () => {
      let auditArgs: Prisma.AuditEventCreateArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({
        auditEvent: { create: async (args: Prisma.AuditEventCreateArgs) => { auditArgs = args; return { id: 'a1' }; } }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' });
      assert.ok(auditArgs);
      assert.strictEqual((auditArgs.data.metadata as Record<string, unknown>).reasonForVisit, undefined);
    });
    await sub.test('48. fieldsChanged refleja únicamente secciones enviadas', async () => {
      let auditArgs: Prisma.AuditEventCreateArgs | undefined;
      const svc = new ClinicalEncounterService(createMockPrisma({
        auditEvent: { create: async (args: Prisma.AuditEventCreateArgs) => { auditArgs = args; return { id: 'a1' }; } }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test', procedures: [] });
      assert.ok(auditArgs);
      const meta = auditArgs.data.metadata as { fieldsChanged: string[] };
      assert.ok(meta.fieldsChanged.includes('reasonForVisit'));
      assert.ok(meta.fieldsChanged.includes('procedures'));
      assert.ok(!meta.fieldsChanged.includes('clinicalNotes'));
    });
    await sub.test('49. respuesta no expone campos internos', async () => {
      const mockResult = {
        id: 'e1', clinicId: 'c1', occurredAt: new Date(), status: 'DRAFT', version: 1,
        createdByMembershipId: 'm1', updatedByMembershipId: 'm1', finalizedByMembershipId: null, userId: 'u1', email: 'a@a.com',
        patient: { id: 'p1', firstName: 'a', lastName: 'b', birthDate: new Date(), sexAtBirth: 'M' },
        professional: { user: { firstName: 'a', lastName: 'b' } },
        amendments: [], procedures: [{ id: 'p1', encounterId: 'e1', description: 'p1', createdAt: new Date() }], diagnoses: []
      };
      const svc = new ClinicalEncounterService(createMockPrisma({
        clinicalEncounter: { findFirst: async () => mockResult }
      }));
      const res = await svc.getEncounterById('c1', 'e1', 'PROFESSIONAL') as Record<string, unknown>;
      assert.strictEqual(res.clinicId, undefined);
      assert.strictEqual(res.createdByMembershipId, undefined);
      assert.strictEqual(res.updatedByMembershipId, undefined);
      assert.strictEqual(res.finalizedByMembershipId, undefined);
      assert.strictEqual(res.userId, undefined);
      assert.strictEqual(res.email, undefined);
      const procs = res.procedures as Record<string, unknown>[];
      assert.ok(procs[0]);
      assert.strictEqual(procs[0].encounterId, undefined);
    });
    await sub.test('50. toda mutación ocurre en una sola transacción Serializable', async () => {
      let isoLevel: Prisma.TransactionIsolationLevel | string = '';
      const svc = new ClinicalEncounterService(createMockPrisma({
        $transaction: async <T>(cb: (tx: IPrismaTxEncounter) => Promise<T>, opts?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => { isoLevel = opts?.isolationLevel || ''; return cb(createMockPrisma() as unknown as IPrismaTxEncounter); }
      }));
      stubSafeDetail(svc);
      await svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reasonForVisit: 'test' });
      assert.strictEqual(isoLevel, 'Serializable');
    });
  });

  await t.test('Rutas', async (sub) => {
    await sub.test('51. PATCH /:id está montado', () => {
      const match = clinicalEncounterRoutes.stack.find((layer: unknown) => (layer as Record<string, unknown>).route && ((layer as Record<string, unknown>).route as Record<string, unknown>).path === '/:id' && (((layer as Record<string, unknown>).route as Record<string, unknown>).methods as Record<string, boolean>).patch);
      assert.ok(match, 'PATCH /:id debe estar montado');
    });
    await sub.test('52. usa autenticación y autorización reales', async () => {
      const layers = clinicalEncounterRoutes.stack;
      const authLayer = layers.find((l: unknown) => (l as Record<string, unknown>).name === 'authMiddleware');
      assert.ok(authLayer, 'authMiddleware debe estar registrado en el router');

      const svc = new ClinicalEncounterService(createMockPrisma());
      await assert.rejects(svc.updateEncounter('c1', 'e1', 'm1', 'u1', 'ASSISTANT', { version: 1, reasonForVisit: 'test' }), (err: unknown) => err instanceof AppError && err.code === 'FORBIDDEN');
    });
  });
});
