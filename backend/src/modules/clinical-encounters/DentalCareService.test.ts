import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { Prisma, AppointmentStatus, ClinicalEncounterStatus } from '../../generated/prisma';
import { AppError } from '../../shared/errors/AppError';
import { FakeClock } from '../../shared/clock/ClockPort';
import { DentalCareService, IDentalCareRepository, DentalCareActor, toStartCareResponse } from './application/DentalCareService';
import { ClinicalEncounterService, IClinicalEncounterRepository } from './application/ClinicalEncounterService';
import { AppointmentController } from '../appointments/infrastructure/AppointmentController';
import { AppointmentService } from '../appointments/application/AppointmentService';
import { ClinicalEncounterController } from './infrastructure/ClinicalEncounterController';
import { prisma } from '../../infrastructure/database/prisma';

const actor: DentalCareActor = { clinicId: 'clinic', membershipId: 'professional', userId: 'user', role: 'PROFESSIONAL' };
const appointmentId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-09-05T12:00:00Z');
const historic = new Date('2026-08-01T12:00:00Z');
type Tx = Parameters<Parameters<IDentalCareRepository['$transaction']>[0]>[0];

function fixture(status: AppointmentStatus = 'SCHEDULED', encounterStatus?: ClinicalEncounterStatus) {
  const appointment = { id: appointmentId, clinicId: 'clinic', patientId: 'patient', professionalMembershipId: 'professional',
    status, startAt: historic, endAt: now, updatedByMembershipId: 'original' };
  const patient = { id: 'patient', clinicId: 'clinic', status: 'ACTIVE', firstName: 'Ana', lastName: 'Perez', secondLastName: null };
  const membership = { id: 'professional', clinicId: 'clinic', userId: 'user', role: 'PROFESSIONAL', status: 'ACTIVE',
    profile: { active: true } as { active: boolean } | null, user: { status: 'ACTIVE', firstName: 'Dra', lastName: 'Uno' } };
  const initialEncounter = { id: 'encounter', clinicId: 'clinic', appointmentId, patientId: 'patient',
    professionalMembershipId: 'professional', status: encounterStatus ?? 'DRAFT', version: 7,
    occurredAt: historic, createdAt: historic, updatedAt: historic,
    createdByMembershipId: 'original-author', updatedByMembershipId: 'original-editor' };
  const state = { appointment, patient, membership, clinic: { id: 'clinic', status: 'ACTIVE' },
    encounter: encounterStatus ? initialEncounter : null as typeof initialEncounter | null,
    audits: [] as Prisma.AuditEventCreateInput[], patientReads: 0, transactions: 0,
    before: null as ((attempt: number) => void) | null,
    failCreate: null as Error | null, failAudit: false };
  const repository: IDentalCareRepository = {
    async $transaction(callback, options) {
      state.transactions++;
      assert.equal(options?.isolationLevel, 'Serializable');
      state.before?.(state.transactions);
      // Transactional fake, not a PostgreSQL concurrency emulator.
      const work = structuredClone({ appointment: state.appointment, encounter: state.encounter, audits: state.audits });
      const project = (encounter: typeof initialEncounter) => ({ ...encounter, patient: state.patient,
        professional: { id: state.membership.id, user: state.membership.user }, appointment: work.appointment });
      const tx = {
        appointment: {
          findFirst: async ({ where }: Prisma.AppointmentFindFirstArgs) =>
            where?.id === work.appointment.id && where?.clinicId === work.appointment.clinicId ? { ...work.appointment } : null,
          update: async ({ data }: Prisma.AppointmentUpdateArgs) => { Object.assign(work.appointment, data); return work.appointment; }
        },
        clinic: { findFirst: async () => state.clinic },
        membership: { findFirst: async ({ where }: Prisma.MembershipFindFirstArgs) =>
          where?.id === state.membership.id && where?.clinicId === state.membership.clinicId && where?.userId === state.membership.userId ? state.membership : null },
        patient: { findFirst: async ({ where }: Prisma.PatientFindFirstArgs) => {
          state.patientReads++;
          return where?.id === state.patient.id && where?.clinicId === state.patient.clinicId ? state.patient : null;
        } },
        clinicalEncounter: {
          findFirst: async ({ where }: Prisma.ClinicalEncounterFindFirstArgs) =>
            work.encounter && work.encounter.appointmentId === where?.appointmentId && work.encounter.clinicId === where?.clinicId ? project(work.encounter) : null,
          create: async ({ data }: Prisma.ClinicalEncounterCreateArgs) => {
            if (state.failCreate) throw state.failCreate;
            work.encounter = { ...initialEncounter, ...data } as typeof initialEncounter;
            return project(work.encounter);
          }
        },
        auditEvent: { create: async ({ data }: Prisma.AuditEventCreateArgs) => {
          if (state.failAudit) throw new Error('audit failed');
          work.audits.push(data as Prisma.AuditEventCreateInput); return data;
        } }
      } as unknown as Tx;
      const result = await callback(tx);
      state.appointment = work.appointment; state.encounter = work.encounter; state.audits = work.audits;
      return result;
    }
  };
  const service = new DentalCareService(repository, new FakeClock(now));
  return { state, repository, service, start: (ctx = actor) => service.startCare(ctx, appointmentId) };
}

function assertValidationError(error: unknown) {
  assert.ok(error instanceof AppError && error.statusCode === 400);
}

function rejectsCode(promise: Promise<unknown>, code: string, statusCode = 409) {
  return assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code && error.statusCode === statusCode);
}

for (const status of ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const) {
  test(`${status} without encounter creates DRAFT using server clock and actor`, async () => {
    const f = fixture(status);
    const result = await f.start();
    assert.deepEqual(toStartCareResponse(result), { created: true,
      appointment: { id: appointmentId, status: 'IN_PROGRESS' },
      encounter: { id: 'encounter', patientId: 'patient', professionalMembershipId: 'professional', status: 'DRAFT', version: 1 } });
    assert.equal(f.state.appointment.status, 'IN_PROGRESS');
    assert.equal(f.state.encounter?.occurredAt.getTime(), now.getTime());
    assert.equal(f.state.encounter?.createdByMembershipId, actor.membershipId);
    assert.equal(f.state.encounter?.updatedByMembershipId, actor.membershipId);
    assert.deepEqual(f.state.audits.map(a => a.action), status === 'IN_PROGRESS'
      ? ['CLINICAL_ENCOUNTER_CREATED'] : ['CLINICAL_ENCOUNTER_CREATED', 'APPOINTMENT_STATUS_CHANGED']);
    const snapshot = structuredClone({ encounter: f.state.encounter, appointment: f.state.appointment, audits: f.state.audits });
    assert.equal((await f.start()).created, false);
    assert.deepEqual({ encounter: f.state.encounter, appointment: f.state.appointment, audits: f.state.audits }, snapshot);
  });
}

for (const [status, encounterStatus] of [['IN_PROGRESS', 'DRAFT'], ['COMPLETED', 'FINALIZED']] as const) {
  test(`${status}/${encounterStatus} recovers unchanged, even with inactive patient`, async () => {
    const f = fixture(status, encounterStatus);
    f.state.patient.status = 'INACTIVE';
    const before = structuredClone({ encounter: f.state.encounter, appointment: f.state.appointment });
    const result = await f.start();
    assert.equal(result.created, false);
    assert.equal(result.encounter.id, 'encounter');
    assert.equal(result.encounter.version, 7);
    assert.equal(result.encounter.occurredAt.getTime(), historic.getTime());
    assert.deepEqual({ encounter: f.state.encounter, appointment: f.state.appointment }, before);
    assert.equal(f.state.patientReads, 0);
    assert.equal(f.state.audits.length, 0);
  });
}

for (const status of ['CANCELLED', 'NO_SHOW'] as const) {
  for (const encounter of [undefined, 'DRAFT', 'FINALIZED'] as const) {
    test(`${status}/${encounter} rejects start`, async () => {
      const f = fixture(status, encounter);
      await rejectsCode(f.start(), 'INVALID_APPOINTMENT_STATE');
      assert.equal(f.state.audits.length, 0);
    });
  }
}

for (const [status, encounter] of [
  ['COMPLETED', undefined], ['COMPLETED', 'DRAFT'], ['IN_PROGRESS', 'FINALIZED'],
  ['SCHEDULED', 'DRAFT'], ['SCHEDULED', 'FINALIZED'], ['CONFIRMED', 'DRAFT'], ['CONFIRMED', 'FINALIZED']
] as const) {
  test(`${status}/${encounter} rejects contradictory states without repair`, async () => {
    const f = fixture(status, encounter);
    await rejectsCode(f.start(), 'CARE_STATE_INCONSISTENT');
    assert.equal(f.state.appointment.status, status);
    assert.equal(f.state.audits.length, 0);
  });
}

for (const recovering of [false, true]) {
  for (const role of ['PROFESSIONAL', 'OWNER', 'ASSISTANT']) {
    test(`${role} unauthorized before ${recovering ? 'recovery' : 'creation'}`, async () => {
      const f = fixture(recovering ? 'COMPLETED' : 'SCHEDULED', recovering ? 'FINALIZED' : undefined);
      f.state.membership.role = role;
      if (role !== 'ASSISTANT') f.state.appointment.professionalMembershipId = 'other-professional';
      await rejectsCode(f.start({ ...actor, role }), 'FORBIDDEN', 403);
      assert.equal(f.state.audits.length, 0);
    });
  }
  for (const profile of [null, { active: false }]) {
    test(`profile ${JSON.stringify(profile)} rejects before ${recovering ? 'recovery' : 'creation'}`, async () => {
      const f = fixture(recovering ? 'COMPLETED' : 'SCHEDULED', recovering ? 'FINALIZED' : undefined);
      f.state.membership.profile = profile;
      await rejectsCode(f.start(), 'PROFESSIONAL_PROFILE_REQUIRED', 403);
    });
  }
}

test('assigned OWNER can start', async () => {
  const f = fixture(); f.state.membership.role = 'OWNER';
  assert.equal((await f.start({ ...actor, role: 'OWNER' })).created, true);
});
test('inactive patient blocks new encounter', async () => {
  const f = fixture(); f.state.patient.status = 'INACTIVE';
  await rejectsCode(f.start(), 'PATIENT_INACTIVE');
  assert.equal(f.state.appointment.status, 'SCHEDULED'); assert.equal(f.state.encounter, null);
});
test('other clinic stays isolated', async () => {
  const f = fixture(); await rejectsCode(f.start({ ...actor, clinicId: 'other' }), 'NOT_FOUND', 404);
});
for (const target of ['clinic', 'membership', 'user'] as const) {
  test(`inactive ${target} rejects recovery`, async () => {
    const f = fixture('IN_PROGRESS', 'DRAFT');
    if (target === 'user') f.state.membership.user.status = 'DISABLED';
    else f.state[target].status = 'SUSPENDED';
    await rejectsCode(f.start(), 'FORBIDDEN', 403);
  });
}
for (const field of ['patientId', 'professionalMembershipId'] as const) {
  test(`existing encounter conflicting ${field} rejected`, async () => {
    const f = fixture('IN_PROGRESS', 'DRAFT'); f.state.encounter![field] = 'other';
    await rejectsCode(f.start(), 'CARE_STATE_INCONSISTENT');
  });
}

function prismaError(code: string, target?: unknown) {
  return new Prisma.PrismaClientKnownRequestError('simulated database conflict', {
    code, clientVersion: 'test', ...(target === undefined ? {} : { meta: { target } })
  });
}
for (const error of [prismaError('P2034'), prismaError('P2002', ['appointmentId']),
  prismaError('P2002', 'ClinicalEncounter_appointmentId_key')]) {
  test(`fresh transaction recovers concurrent winner after ${error.code}/${JSON.stringify(error.meta)}`, async () => {
    const f = fixture();
    f.state.failCreate = error;
    f.state.before = attempt => {
      if (attempt === 2) {
        // First transaction must have rolled back its appointment update.
        assert.equal(f.state.appointment.status, 'SCHEDULED');
        assert.equal(f.state.encounter, null);
        assert.equal(f.state.audits.length, 0);
        const winner = fixture('IN_PROGRESS', 'DRAFT');
        f.state.appointment = winner.state.appointment;
        f.state.encounter = winner.state.encounter;
        f.state.failCreate = null;
      }
    };
    assert.equal((await f.start()).created, false);
    assert.equal(f.state.transactions, 2);
    assert.equal(f.state.encounter?.version, 7);
    assert.equal(f.state.audits.length, 0);
  });
}
test('P2034 retries and succeeds creating when no winner exists', async () => {
  const f = fixture(); f.state.before = attempt => { if (attempt === 1) throw prismaError('P2034'); };
  assert.equal((await f.start()).created, true); assert.equal(f.state.transactions, 2);
});
test('retries stop after three attempts', async () => {
  const f = fixture(); f.state.before = () => { throw prismaError('P2034'); };
  await rejectsCode(f.start(), 'CONCURRENCY_ERROR'); assert.equal(f.state.transactions, 3);
});
for (const target of [undefined, ['id'], ['appointmentId', 'other'], 'Other_appointmentId_key']) {
  test(`unrelated P2002 ${JSON.stringify(target)} is not recovered`, async () => {
    const f = fixture(); const error = prismaError('P2002', target); f.state.failCreate = error;
    await assert.rejects(f.start(), e => e === error); assert.equal(f.state.transactions, 1);
    assert.equal(f.state.appointment.status, 'SCHEDULED');
  });
}
test('audit failure rolls back encounter and appointment without retry', async () => {
  const f = fixture(); f.state.failAudit = true;
  await assert.rejects(f.start(), /audit failed/);
  assert.equal(f.state.encounter, null); assert.equal(f.state.appointment.status, 'SCHEDULED');
  assert.equal(f.state.audits.length, 0); assert.equal(f.state.transactions, 1);
});

test('legacy linked create delegates and preserves DTO, ignores client occurredAt', async () => {
  const f = fixture();
  const service = new ClinicalEncounterService(f.repository as IClinicalEncounterRepository);
  const input = { patientId: 'patient', appointmentId, occurredAt: historic.toISOString() };
  const first = await service.createEncounter('clinic', 'professional', 'user', 'PROFESSIONAL', input);
  assert.equal(first.created, true); assert.equal(first.patient.id, 'patient');
  assert.notEqual(first.occurredAt.getTime(), historic.getTime());
  const second = await service.createEncounter('clinic', 'professional', 'user', 'PROFESSIONAL', input);
  assert.equal(second.created, false); assert.equal(second.id, first.id);
  assert.deepEqual(second.occurredAt, first.occurredAt); assert.equal(f.state.audits.length, 2);
});
test('legacy linked create validates patientId even on recovery', async () => {
  const f = fixture('IN_PROGRESS', 'DRAFT');
  const service = new ClinicalEncounterService(f.repository as IClinicalEncounterRepository);
  await rejectsCode(service.createEncounter('clinic', 'professional', 'user', 'PROFESSIONAL',
    { patientId: 'other', appointmentId, occurredAt: historic.toISOString() }), 'NOT_FOUND', 404);
});
test('legacy linked create cannot bypass active professional profile', async () => {
  const f = fixture(); f.state.membership.profile = null;
  const service = new ClinicalEncounterService(f.repository as IClinicalEncounterRepository);
  await rejectsCode(service.createEncounter('clinic', 'professional', 'user', 'PROFESSIONAL',
    { patientId: 'patient', appointmentId, occurredAt: historic.toISOString() }), 'PROFESSIONAL_PROFILE_REQUIRED', 403);
});

test('legacy HTTP controller preserves creation DTO and returns 201 then 200', async (t) => {
  const f = fixture();
  const patientId = '22222222-2222-4222-8222-222222222222';
  f.state.patient.id = patientId;
  f.state.appointment.patientId = patientId;
  // The existing static controller owns a service backed by the Prisma singleton.
  // Replace only its transaction boundary; no database or HTTP listener is opened.
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = f.repository.$transaction.bind(f.repository) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = originalTransaction; });
  let status = 0;
  const bodies: Array<Record<string, unknown>> = [];
  const res = { status(code: number) { status = code; return this; },
    json(value: Record<string, unknown>) { bodies.push(value); return this; } } as Response;
  const req = { authContext: actor, body: { patientId, appointmentId, occurredAt: historic.toISOString() } } as unknown as Request;
  const next = (error?: unknown) => { if (error) throw error; };
  await ClinicalEncounterController.create(req, res, next);
  assert.equal(status, 201);
  await ClinicalEncounterController.create(req, res, next);
  assert.equal(status, 200);
  assert.equal(bodies[0]?.id, bodies[1]?.id);
  assert.deepEqual(Object.keys(bodies[0]!).sort(), [
    'id', 'occurredAt', 'status', 'version', 'patient', 'professional', 'appointment', 'createdAt', 'updatedAt'
  ].sort());
  assert.equal((bodies[0]?.appointment as { status: string }).status, 'IN_PROGRESS');
  assert.equal(f.state.audits.length, 2);
});

test('start-care controller returns exact 201/200 DTO and rejects client-controlled context', async () => {
  const f = fixture();
  const controller = new AppointmentController({} as AppointmentService, f.service);
  let status = 0; let body: unknown; let error: unknown;
  const res = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } } as Response;
  const call = async (input: unknown, id = appointmentId) => {
    error = undefined;
    await controller.startCare({ authContext: actor, params: { id }, body: input } as unknown as Request,
      res, e => { error = e; });
  };
  await call({}); assert.equal(error, undefined); assert.equal(status, 201);
  assert.deepEqual(body, { created: true, appointment: { id: appointmentId, status: 'IN_PROGRESS' },
    encounter: { id: 'encounter', patientId: 'patient', professionalMembershipId: 'professional', status: 'DRAFT', version: 1 } });
  await call({}); assert.equal(status, 200);
  for (const field of ['patientId', 'professionalMembershipId', 'clinicId', 'occurredAt']) {
    await call({ [field]: 'injected' }); assertValidationError(error);
  }
  await call({}, 'invalid'); assertValidationError(error);
  assert.equal(f.state.transactions, 2);
});
