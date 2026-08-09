import test from 'node:test';
import assert from 'node:assert/strict';
import { ClinicalEncounterService, IClinicalEncounterRepository, IPrismaTxEncounter } from './application/ClinicalEncounterService';
import { AppError } from '../../shared/errors/AppError';
import { Prisma } from '../../generated/prisma';

import { listClinicalRecordsSchema } from './domain/ClinicalEncounterSchema';

// Reusable mock builder without any
const createMockPrisma = (overrides: Partial<IClinicalEncounterRepository> = {}): IClinicalEncounterRepository => {
  return {
    clinicalEncounter: {
      findFirst: async () => null,
      findMany: async () => [],
      count: async () => 0,
    } as unknown as IClinicalEncounterRepository['clinicalEncounter'],
    clinicalVitalSigns: {} as unknown as IClinicalEncounterRepository['clinicalVitalSigns'],
    clinicalDiagnosis: {} as unknown as IClinicalEncounterRepository['clinicalDiagnosis'],
    clinicalProcedure: {} as unknown as IClinicalEncounterRepository['clinicalProcedure'],
    patient: {} as unknown as IClinicalEncounterRepository['patient'],
    membership: {} as unknown as IClinicalEncounterRepository['membership'],
    appointment: {} as unknown as IClinicalEncounterRepository['appointment'],
    auditEvent: {} as unknown as IClinicalEncounterRepository['auditEvent'],
    $transaction: async <T>(cb: (tx: IPrismaTxEncounter) => Promise<T>): Promise<T> => cb(createMockPrisma(overrides) as unknown as IPrismaTxEncounter),
    ...overrides
  } as unknown as IClinicalEncounterRepository;
};

test('1. OWNER puede listar records. 2. PROFESSIONAL puede listar records. 3. ASSISTANT y rol desconocido reciben 403.', async () => {
  const service = new ClinicalEncounterService(createMockPrisma());

  await assert.doesNotReject(async () => {
    await service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'OWNER' }, { mine: '0', page: 1, pageSize: 20 });
  });

  await assert.doesNotReject(async () => {
    await service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'PROFESSIONAL' }, { mine: '0', page: 1, pageSize: 20 });
  });

  await assert.rejects(
    () => service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'ASSISTANT' }, { mine: '0', page: 1, pageSize: 20 }),
    (err: unknown) => err instanceof AppError && err.statusCode === 403
  );

  await assert.rejects(
    () => service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'BILLING' }, { mine: '0', page: 1, pageSize: 20 }),
    (err: unknown) => err instanceof AppError && err.statusCode === 403
  );
});

test('Schema strict rechaza parametros no permitidos', () => {
  assert.throws(() => {
    listClinicalRecordsSchema.parse({
      mine: '1',
      professionalMembershipId: 'malicious-id'
    });
  });

  assert.throws(() => {
    listClinicalRecordsSchema.parse({
      mine: '0',
      clinicId: 'malicious-clinic'
    });
  });

  // Valid params work
  assert.doesNotThrow(() => {
    listClinicalRecordsSchema.parse({
      status: 'DRAFT',
      mine: '1'
    });
  });
});

test('4. ASSISTANT no ejecuta findMany/count clínico para records.', async () => {
  let executed = false;
  const service = new ClinicalEncounterService(createMockPrisma({
    clinicalEncounter: {
      findMany: async () => { executed = true; return []; },
      count: async () => { executed = true; return 0; }
    } as unknown as IClinicalEncounterRepository['clinicalEncounter']
  }));

  try {
    await service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'ASSISTANT' }, { mine: '0', page: 1, pageSize: 20 });
  } catch {}

  assert.strictEqual(executed, false);
});

test('5. siempre filtra clinicId. 6. tenant distinto nunca aparece. 7-11. Filtros aplican bien.', async () => {
  const capturedArgs: Prisma.ClinicalEncounterFindManyArgs[] = [];
  const service = new ClinicalEncounterService(createMockPrisma({
    clinicalEncounter: {
      findMany: async (args: Prisma.ClinicalEncounterFindManyArgs) => {
        capturedArgs.push(args);
        return [];
      },
      count: async () => 0
    } as unknown as IClinicalEncounterRepository['clinicalEncounter']
  }));

  await service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'OWNER' }, { mine: '0', page: 1, pageSize: 20 });
  assert.ok(capturedArgs[0]);
  assert.strictEqual(capturedArgs[0].where?.clinicId, 'c1');
  assert.strictEqual(capturedArgs[0].where?.professionalMembershipId, undefined);
  assert.strictEqual(capturedArgs[0].where?.status, undefined);

  // mine=1 y status=DRAFT
  await service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'PROFESSIONAL' }, { mine: '1', status: 'DRAFT', page: 1, pageSize: 20 });
  assert.ok(capturedArgs[1]);
  assert.strictEqual(capturedArgs[1].where?.clinicId, 'c1');
  assert.strictEqual(capturedArgs[1].where?.professionalMembershipId, 'm1');
  assert.strictEqual(capturedArgs[1].where?.status, 'DRAFT');

  // status=FINALIZED
  await service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'PROFESSIONAL' }, { mine: '0', status: 'FINALIZED', page: 1, pageSize: 20 });
  assert.ok(capturedArgs[2]);
  assert.strictEqual(capturedArgs[2].where?.status, 'FINALIZED');
});

test('12-13. q busca por palabras del nombre, no contenido clínico.', async () => {
  const capturedArgs: Prisma.ClinicalEncounterFindManyArgs[] = [];

  const service = new ClinicalEncounterService(createMockPrisma({
    clinicalEncounter: {
      findMany: async (args: Prisma.ClinicalEncounterFindManyArgs) => {
        capturedArgs.push(args);
        return [];
      },
      count: async () => 0
    } as unknown as IClinicalEncounterRepository['clinicalEncounter']
  }));

  await service.listRecords(
    { clinicId: 'c1', membershipId: 'm1', role: 'OWNER' },
    { q: 'Angel del', mine: '0', page: 1, pageSize: 20 }
  );

  assert.ok(capturedArgs[0]);

  assert.deepStrictEqual(capturedArgs[0].where?.patient, {
    AND: [
      {
        OR: [
          { firstName: { contains: 'Angel', mode: 'insensitive' } },
          { lastName: { contains: 'Angel', mode: 'insensitive' } },
          { secondLastName: { contains: 'Angel', mode: 'insensitive' } }
        ]
      },
      {
        OR: [
          { firstName: { contains: 'del', mode: 'insensitive' } },
          { lastName: { contains: 'del', mode: 'insensitive' } },
          { secondLastName: { contains: 'del', mode: 'insensitive' } }
        ]
      }
    ]
  });

  assert.strictEqual('clinicalNotes' in (capturedArgs[0].where ?? {}), false);
  assert.strictEqual('diagnoses' in (capturedArgs[0].where ?? {}), false);
});

test('Regresión: select del usuario profesional no solicita secondLastName.', async () => {
  let capturedArgs: Prisma.ClinicalEncounterFindManyArgs | undefined;

  const service = new ClinicalEncounterService(createMockPrisma({
    clinicalEncounter: {
      findMany: async (args: Prisma.ClinicalEncounterFindManyArgs) => {
        capturedArgs = args;
        return [];
      },
      count: async () => 0
    } as unknown as IClinicalEncounterRepository['clinicalEncounter']
  }));

  await service.listRecords(
    { clinicId: 'c1', membershipId: 'm1', role: 'OWNER' },
    { mine: '0', page: 1, pageSize: 20 }
  );

  assert.ok(capturedArgs);

  assert.deepStrictEqual(
    capturedArgs.select?.professional,
    {
      select: {
        id: true,
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    }
  );
});

test('14-20. Paginación y retornos.', async () => {
  const service = new ClinicalEncounterService(createMockPrisma({
    clinicalEncounter: {
      findMany: async () => [],
      count: async () => 45
    } as unknown as IClinicalEncounterRepository['clinicalEncounter']
  }));

  const res = await service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'OWNER' }, { mine: '0', page: 2, pageSize: 20 });
  assert.strictEqual(res.page, 2);
  assert.strictEqual(res.pageSize, 20);
  assert.strictEqual(res.total, 45);
  assert.strictEqual(res.totalPages, 3);
});

test('21-24. item contains mapped fields exactly.', async () => {
  const mockItem = {
    id: 'enc-1',
    occurredAt: new Date(),
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
    finalizedAt: null,
    patient: {
      id: 'pat-1',
      firstName: 'A',
      lastName: 'B',
      secondLastName: null
    },
    professional: {
      id: 'mem-1',
      user: {
        firstName: 'P',
        lastName: 'D',
      }
    },
    appointment: null
  };

  const service = new ClinicalEncounterService(createMockPrisma({
    clinicalEncounter: {
      findMany: async () => [mockItem],
      count: async () => 1
    } as unknown as IClinicalEncounterRepository['clinicalEncounter']
  }));

  const res = await service.listRecords({ clinicId: 'c1', membershipId: 'm1', role: 'OWNER' }, { mine: '0', page: 1, pageSize: 20 });
  const item = res.items[0];
  assert.ok(item);
  assert.strictEqual(item.id, 'enc-1');
  assert.deepStrictEqual(item.patient, { id: 'pat-1', displayName: 'A B' });
  assert.deepStrictEqual(item.professional, { membershipId: 'mem-1', displayName: 'P D' });
  assert.strictEqual(item.appointment, null);
  assert.strictEqual((item as any).narrative, undefined);
  assert.strictEqual((item as any).diagnoses, undefined);
});
