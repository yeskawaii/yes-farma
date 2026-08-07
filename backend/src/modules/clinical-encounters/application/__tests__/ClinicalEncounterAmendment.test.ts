import test from 'node:test';
import assert from 'node:assert/strict';
import { createClinicalEncounterAmendmentSchema } from '../../domain/ClinicalEncounterSchema';
import { ClinicalEncounterService, IClinicalEncounterRepository, IPrismaTxEncounter } from '../ClinicalEncounterService';
import { AppError } from '../../../../shared/errors/AppError';
import { Prisma } from '../../../../generated/prisma';

type ClinicalEncounterMockMethods = {
  findFirst?: (args?: Prisma.ClinicalEncounterFindFirstArgs) => Promise<unknown>;
  updateMany?: (args: Prisma.ClinicalEncounterUpdateManyArgs) => Promise<{ count: number }>;
};

type AuditEventMockMethods = {
  create?: (args: Prisma.AuditEventCreateArgs) => Promise<unknown>;
};

type ClinicalEncounterAmendmentMockMethods = {
  create?: (args: Prisma.ClinicalEncounterAmendmentCreateArgs) => Promise<unknown>;
};

type MockRepositoryOverrides = {
  clinicalEncounter?: ClinicalEncounterMockMethods;
  auditEvent?: AuditEventMockMethods;
  clinicalEncounterAmendment?: ClinicalEncounterAmendmentMockMethods;
  $transaction?: IClinicalEncounterRepository['$transaction'];
};

const createMockPrisma = (overrides: MockRepositoryOverrides = {}): IClinicalEncounterRepository => {
  const clinicalEncounterMethods = {
    findFirst: async () => ({ id: 'enc-1', status: 'FINALIZED', version: 1, professionalMembershipId: 'm1', occurredAt: new Date() }),
    updateMany: async () => ({ count: 1 }),
    ...overrides.clinicalEncounter
  };

  const auditEventMethods = {
    create: async () => ({ id: 'audit-1' }),
    ...overrides.auditEvent
  };

  const amendmentMethods = {
    create: async () => ({ id: 'amend-1' }),
    ...overrides.clinicalEncounterAmendment
  };

  const repository = {
    clinicalEncounter: clinicalEncounterMethods as unknown as IClinicalEncounterRepository['clinicalEncounter'],
    clinicalVitalSigns: {} as unknown as IClinicalEncounterRepository['clinicalVitalSigns'],
    clinicalDiagnosis: {} as unknown as IClinicalEncounterRepository['clinicalDiagnosis'],
    clinicalProcedure: {} as unknown as IClinicalEncounterRepository['clinicalProcedure'],
    clinicalEncounterAmendment: amendmentMethods,
    auditEvent: auditEventMethods as unknown as IClinicalEncounterRepository['auditEvent'],
    patient: {} as IClinicalEncounterRepository['patient'],
    membership: {} as IClinicalEncounterRepository['membership'],
    appointment: {} as IClinicalEncounterRepository['appointment'],
    $transaction: overrides.$transaction || (async <T>(cb: (tx: IPrismaTxEncounter) => Promise<T>): Promise<T> => {
      return cb(repository as unknown as IPrismaTxEncounter);
    })
  };

  return repository as unknown as IClinicalEncounterRepository;
};

test('create amendment schema validation checks', () => {
  const noVersion = createClinicalEncounterAmendmentSchema.safeParse({ reason: 'abc', note: 'def' });
  assert.equal(noVersion.success, false);

  const noReason = createClinicalEncounterAmendmentSchema.safeParse({ version: 1, note: 'def' });
  assert.equal(noReason.success, false);

  const emptyReason = createClinicalEncounterAmendmentSchema.safeParse({ version: 1, reason: '', note: 'def' });
  assert.equal(emptyReason.success, false);

  const emptyNote = createClinicalEncounterAmendmentSchema.safeParse({ version: 1, reason: 'abc', note: '   ' });
  assert.equal(emptyNote.success, false);

  const longReason = createClinicalEncounterAmendmentSchema.safeParse({ version: 1, reason: 'a'.repeat(501), note: 'def' });
  assert.equal(longReason.success, false);

  const valid = createClinicalEncounterAmendmentSchema.safeParse({ version: 1, reason: 'Razón válida', note: 'Nota válida' });
  assert.equal(valid.success, true);

  // note usa db.Text y no tiene un máximo de dominio definido.
  const longNote = createClinicalEncounterAmendmentSchema.safeParse({
    version: 1,
    reason: 'Razón válida',
    note: 'n'.repeat(10001)
  });
  assert.equal(longNote.success, true);

  const extraFields = createClinicalEncounterAmendmentSchema.safeParse({ version: 1, reason: 'A', note: 'B', status: 'DRAFT', author: 'Test' });
  assert.equal(extraFields.success, false); // strict
});

test('profesional responsable puede agregar enmienda a FINALIZED, avanza version y audita correctamente', async () => {
  let updateManyArgs: Prisma.ClinicalEncounterUpdateManyArgs | undefined;
  let auditCreateArgs: Prisma.AuditEventCreateArgs | undefined;
  let amendmentCreateArgs: Prisma.ClinicalEncounterAmendmentCreateArgs | undefined;

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
    },
    clinicalEncounterAmendment: {
      create: async (args) => {
        amendmentCreateArgs = args;
        return { id: 'amend-1' };
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
    finalizedBy: { displayName: 'Dr. Test' },
    amendments: [
      { id: 'amend-1', reason: 'Olvidé algo', note: 'El paciente mencionó dolor leve.', createdAt: new Date(), author: { displayName: 'Dr. Test' } }
    ]
  } as unknown as Awaited<ReturnType<ClinicalEncounterService['getEncounterById']>>);

  const result = await service.addAmendment('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', {
    version: 1,
    reason: 'Olvidé algo',
    note: 'El paciente mencionó dolor leve.'
  });

  assert.equal(result.status, 'FINALIZED');
  assert.equal(result.version, 2);
  assert.equal(result.amendments.length, 1);

  const createdAmendment = result.amendments[0];
  assert.ok(createdAmendment);
  if (!createdAmendment) {
    throw new Error('Expected created amendment in response');
  }

  assert.equal(createdAmendment.reason, 'Olvidé algo');

  // Verify ClinicalEncounter update (increment version, no changes to finalizedAt or status)
  assert.ok(updateManyArgs);
  if (!updateManyArgs) {
    throw new Error('Expected clinicalEncounter.updateMany to be called');
  }

  assert.equal((updateManyArgs.where as { version?: number }).version, 1);
  assert.equal((updateManyArgs.where as { status?: string }).status, 'FINALIZED');
  assert.deepEqual(updateManyArgs.data, {
    version: { increment: 1 },
    updatedByMembershipId: 'm1'
  });

  // El encounter original solo cambia metadata técnica.
  // Cualquier mutación clínica adicional hará fallar esta aserción.

  // Verify Amendment creation
  assert.ok(amendmentCreateArgs);
  assert.equal(amendmentCreateArgs.data.reason, 'Olvidé algo');
  assert.equal(amendmentCreateArgs.data.note, 'El paciente mencionó dolor leve.');
  assert.equal(amendmentCreateArgs.data.createdByMembershipId, 'm1');
  assert.equal(amendmentCreateArgs.data.encounterId, 'enc-1');
  assert.equal(amendmentCreateArgs.data.clinicId, 'c1');

  // Verify Audit Event
  assert.ok(auditCreateArgs);
  assert.equal(auditCreateArgs.data.action, 'CLINICAL_ENCOUNTER_AMENDMENT_CREATED');

  const metadata = auditCreateArgs.data.metadata as Record<string, unknown>;
  assert.ok(metadata);
  assert.equal(metadata.status, 'FINALIZED');
  assert.equal(metadata.version, 2);
  assert.equal(metadata.amendmentId, 'amend-1');

  // Ensure no PHI in audit
  assert.equal('reason' in metadata, false);
  assert.equal('note' in metadata, false);
});

test('version desactualizada devuelve 409', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', status: 'FINALIZED', version: 2, professionalMembershipId: 'm1' })
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.addAmendment('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reason: 'R', note: 'N' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'CLINICAL_ENCOUNTER_VERSION_CONFLICT');
      return true;
    }
  );
});

test('intentar enmendar DRAFT devuelve 409', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', status: 'DRAFT', version: 1, professionalMembershipId: 'm1' })
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.addAmendment('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reason: 'R', note: 'N' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'CLINICAL_ENCOUNTER_NOT_FINALIZED');
      return true;
    }
  );
});

test('otro profesional no puede enmendar', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', status: 'FINALIZED', version: 1, professionalMembershipId: 'm2' })
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.addAmendment('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reason: 'R', note: 'N' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );
});

test('OWNER distinto del profesional responsable no puede enmendar', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => ({ id: 'enc-1', status: 'FINALIZED', version: 1, professionalMembershipId: 'm2' })
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.addAmendment('c1', 'enc-1', 'm1', 'u1', 'OWNER', { version: 1, reason: 'R', note: 'N' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );
});

test('ASSISTANT no puede enmendar', async () => {
  const prisma = createMockPrisma();
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.addAmendment('c1', 'enc-1', 'm1', 'u1', 'ASSISTANT', { version: 1, reason: 'R', note: 'N' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );
});

test('encuentro de otra clínica no puede enmendarse (findFirst devuelve null)', async () => {
  const prisma = createMockPrisma({
    clinicalEncounter: {
      findFirst: async () => null
    }
  });
  const service = new ClinicalEncounterService(prisma);

  await assert.rejects(
    () => service.addAmendment('c1', 'enc-1', 'm1', 'u1', 'PROFESSIONAL', { version: 1, reason: 'R', note: 'N' }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'NOT_FOUND');
      return true;
    }
  );
});
