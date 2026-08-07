import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeClinicalEncounterSchema } from './domain/ClinicalEncounterSchema';
import { ClinicalEncounterService, IClinicalEncounterRepository, IPrismaTxEncounter } from './application/ClinicalEncounterService';
import { AppError } from '../../shared/errors/AppError';
import { Prisma } from '../../generated/prisma';

type ClinicalEncounterMockMethods = {
  findFirst?: (args?: Prisma.ClinicalEncounterFindFirstArgs) => Promise<unknown>;
  updateMany?: (args: Prisma.ClinicalEncounterUpdateManyArgs) => Promise<{ count: number }>;
};

type AuditEventMockMethods = {
  create?: (args: Prisma.AuditEventCreateArgs) => Promise<unknown>;
};

type MockRepositoryOverrides = {
  clinicalEncounter?: ClinicalEncounterMockMethods;
  auditEvent?: AuditEventMockMethods;
  $transaction?: IClinicalEncounterRepository['$transaction'];
};

const createMockPrisma = (overrides: MockRepositoryOverrides = {}): IClinicalEncounterRepository => {
  const clinicalEncounterMethods = {
    findFirst: async () => ({ id: 'enc-1', status: 'DRAFT', version: 1, professionalMembershipId: 'm1', occurredAt: new Date() }),
    updateMany: async () => ({ count: 1 }),
    ...overrides.clinicalEncounter
  };

  const auditEventMethods = {
    create: async () => ({ id: 'audit-1' }),
    ...overrides.auditEvent
  };

  const repository: IClinicalEncounterRepository = {
    clinicalEncounter: clinicalEncounterMethods as unknown as IClinicalEncounterRepository['clinicalEncounter'],
    clinicalVitalSigns: {} as unknown as IClinicalEncounterRepository['clinicalVitalSigns'],
    clinicalDiagnosis: {} as unknown as IClinicalEncounterRepository['clinicalDiagnosis'],
    clinicalProcedure: {} as unknown as IClinicalEncounterRepository['clinicalProcedure'],
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

test('finalize schema rejects body without version', () => {
  const result = finalizeClinicalEncounterSchema.safeParse({});
  assert.equal(result.success, false);
});

test('finalize schema rejects invalid version', () => {
  const result = finalizeClinicalEncounterSchema.safeParse({ version: 0 });
  assert.equal(result.success, false);
});

test('profesional responsable puede finalizar DRAFT, devuelve FINALIZED, aumenta version y establece audit info', async () => {
  let updateManyArgs: Prisma.ClinicalEncounterUpdateManyArgs | undefined;
  let auditCreateArgs: Prisma.AuditEventCreateArgs | undefined;

  const prisma = createMockPrisma({
    clinicalEncounter: {
      updateMany: async (args) => {
        updateManyArgs = args;
        return { count: 1 };
      }
    },
    auditEvent: {
      create: async (args) => {
        auditCreateArgs = args;
        return { id: 'audit-1' };
      }
    }
  });

  const service = new ClinicalEncounterService(prisma);
  
  // Mock getEncounterById
  service.getEncounterById = async () => ({
    id: 'enc-1',
    status: 'FINALIZED',
    version: 2,
    finalizedAt: new Date(),
    finalizedBy: { displayName: 'Dr. Test' }
  } as unknown as Awaited<ReturnType<ClinicalEncounterService['getEncounterById']>>);

  const result = await service.finalizeEncounter('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', 1);

  assert.equal(result.status, 'FINALIZED');
  assert.equal(result.version, 2);

  assert.ok(updateManyArgs);
  assert.equal((updateManyArgs.where as { version?: number }).version, 1);
  assert.equal((updateManyArgs.where as { status?: string }).status, 'DRAFT');
  assert.equal((updateManyArgs.data as { status?: string }).status, 'FINALIZED');
  assert.ok((updateManyArgs.data as { finalizedAt?: Date }).finalizedAt instanceof Date);
  assert.equal((updateManyArgs.data as { finalizedByMembershipId?: string }).finalizedByMembershipId, 'm1');
  assert.deepEqual((updateManyArgs.data as Record<string, unknown>).version, { increment: 1 });

  assert.ok(auditCreateArgs);
  assert.equal(auditCreateArgs.data.action, 'CLINICAL_ENCOUNTER_FINALIZED');
  
  const metadata = auditCreateArgs.data.metadata as Record<string, unknown>;
  assert.ok(metadata);
  assert.equal(metadata.status, 'FINALIZED');
  assert.equal(metadata.version, 2);
  
  // Ensure no PHI in audit
  assert.equal('reasonForVisit' in metadata, false);
  assert.equal('relevantHistory' in metadata, false);
  assert.equal('allergies' in metadata, false);
  assert.equal('currentMedications' in metadata, false);
  assert.equal('physicalExamination' in metadata, false);
  assert.equal('indications' in metadata, false);
  assert.equal('clinicalNotes' in metadata, false);
  assert.equal('diagnoses' in metadata, false);
  assert.equal('procedures' in metadata, false);
});

test('version desactualizada devuelve 409', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', status: 'DRAFT', version: 2, professionalMembershipId: 'm1' })
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.finalizeEncounter('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', 1),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'CLINICAL_ENCOUNTER_VERSION_CONFLICT');
      return true;
    }
  );
});

test('intentar finalizar FINALIZED devuelve 409', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', status: 'FINALIZED', version: 1, professionalMembershipId: 'm1' })
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.finalizeEncounter('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', 1),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'CLINICAL_ENCOUNTER_FINALIZED');
      return true;
    }
  );
});

test('otro profesional no puede finalizar', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', status: 'DRAFT', version: 1, professionalMembershipId: 'm2' })
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.finalizeEncounter('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', 1),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );
});

test('OWNER distinto del profesional responsable no puede finalizar', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', status: 'DRAFT', version: 1, professionalMembershipId: 'm2' })
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.finalizeEncounter('c1', 'enc-1', 'm1', 'u1', 'OWNER', 1),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );
});

test('ASSISTANT no puede finalizar', async () => {
  const prisma = createMockPrisma();
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.finalizeEncounter('c1', 'enc-1', 'm1', 'u1', 'ASSISTANT', 1),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );
});

test('encuentro de otra clínica no puede finalizarse (findFirst devuelve null)', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => null
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.finalizeEncounter('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', 1),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'NOT_FOUND');
      return true;
    }
  );
});

test('PATCH/updateEncounter posterior a FINALIZED queda rechazado', async () => {
  let updateManyCalled = false;
  
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', status: 'FINALIZED', version: 1, professionalMembershipId: 'm1' }),
      updateMany: async () => {
        updateManyCalled = true;
        return { count: 1 };
      }
    }
  });
  
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.updateEncounter('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', {
      version: 1,
      reasonForVisit: 'This should fail'
    }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'CLINICAL_ENCOUNTER_FINALIZED');
      return true;
    }
  );

  assert.equal(updateManyCalled, false, 'updateMany no debe ejecutarse si el estado es FINALIZED');
});

