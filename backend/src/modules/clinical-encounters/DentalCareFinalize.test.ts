import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { Prisma, AppointmentStatus, ClinicalEncounterStatus } from '../../generated/prisma';
import { AppError } from '../../shared/errors/AppError';
import { FakeClock } from '../../shared/clock/ClockPort';
import { prisma } from '../../infrastructure/database/prisma';
import { DentalCareService, IDentalCareRepository, DentalCareActor } from './application/DentalCareService';
import { ClinicalEncounterService, IClinicalEncounterRepository } from './application/ClinicalEncounterService';
import { ClinicalEncounterController } from './infrastructure/ClinicalEncounterController';

const encounterId = '11111111-1111-4111-8111-111111111111';
const actor: DentalCareActor = { clinicId: 'clinic', membershipId: 'professional', userId: 'user', role: 'PROFESSIONAL' };
const earlier = new Date('2026-09-01T10:00:00Z');
const now = new Date('2026-09-05T12:00:00Z');
type Tx = Parameters<Parameters<IDentalCareRepository['$transaction']>[0]>[0];

function fixture(appointmentStatus: AppointmentStatus | null = 'IN_PROGRESS', status: ClinicalEncounterStatus = 'DRAFT') {
  const initialEncounter = {
    id: encounterId, clinicId: 'clinic', patientId: 'patient', professionalMembershipId: 'professional',
    appointmentId: appointmentStatus ? 'appointment' : null,
    status, version: 7, occurredAt: earlier, createdAt: earlier, updatedAt: earlier,
    createdByMembershipId: 'original-author', updatedByMembershipId: 'original-editor',
    finalizedAt: status === 'FINALIZED' ? earlier : null,
    finalizedByMembershipId: status === 'FINALIZED' ? 'professional' : null
  };
  const initialAppointment = {
    id: 'appointment', clinicId: 'clinic', patientId: 'patient', professionalMembershipId: 'professional',
    status: appointmentStatus ?? 'IN_PROGRESS', startAt: earlier, endAt: now,
    createdAt: earlier, updatedAt: earlier, updatedByMembershipId: 'original-editor'
  };
  const state = {
    encounter: initialEncounter as typeof initialEncounter | null,
    appointment: appointmentStatus ? initialAppointment : null as typeof initialAppointment | null,
    membership: { id: 'professional', clinicId: 'clinic', userId: 'user', role: 'PROFESSIONAL',
      status: 'ACTIVE', user: { status: 'ACTIVE' } },
    audits: [] as Prisma.AuditEventCreateInput[],
    transactions: 0, reads: [] as string[], writes: [] as string[],
    failAppointment: null as Error | null, failAuditAt: 0, failEncounter: null as Error | null,
    appointmentCount: 1, encounterCount: 1,
    beforeAttempt: null as ((attempt: number) => void) | null,
    beforeCommit: null as ((attempt: number) => void) | null
  };
  const snapshot = () => structuredClone({ encounter: state.encounter, appointment: state.appointment, audits: state.audits });
  const repository: IDentalCareRepository = {
    async $transaction(callback, options) {
      state.transactions++;
      assert.equal(options?.isolationLevel, 'Serializable');
      state.beforeAttempt?.(state.transactions);
      const work = snapshot();
      const tx = {
        clinicalEncounter: {
          findFirst: async ({ where, select }: Prisma.ClinicalEncounterFindFirstArgs) => {
            state.reads.push(select && Object.keys(select).length === 1 ? 'link' : 'encounter');
            return work.encounter && where?.id === work.encounter.id && where?.clinicId === work.encounter.clinicId
              ? structuredClone(work.encounter) : null;
          },
          updateMany: async ({ where, data }: Prisma.ClinicalEncounterUpdateManyArgs) => {
            state.writes.push('encounter');
            if (state.failEncounter) throw state.failEncounter;
            if (!work.encounter || where?.id !== work.encounter.id || where?.clinicId !== work.encounter.clinicId ||
              where?.version !== work.encounter.version || where?.status !== work.encounter.status ||
              where?.professionalMembershipId !== work.encounter.professionalMembershipId ||
              where?.appointmentId !== work.encounter.appointmentId) return { count: 0 };
            if (state.encounterCount !== 1) return { count: state.encounterCount };
            assert.deepEqual(data.version, { increment: 1 });
            Object.assign(work.encounter, data, { version: work.encounter.version + 1, updatedAt: now });
            return { count: 1 };
          }
        },
        appointment: {
          findFirst: async ({ where }: Prisma.AppointmentFindFirstArgs) => {
            state.reads.push('appointment');
            return work.appointment && where?.id === work.appointment.id && where?.clinicId === work.appointment.clinicId
              ? structuredClone(work.appointment) : null;
          },
          updateMany: async ({ where, data }: Prisma.AppointmentUpdateManyArgs) => {
            state.writes.push('appointment');
            if (state.failAppointment) throw state.failAppointment;
            if (!work.appointment || where?.id !== work.appointment.id || where?.clinicId !== work.appointment.clinicId ||
              where?.status !== work.appointment.status || where?.patientId !== work.appointment.patientId ||
              where?.professionalMembershipId !== work.appointment.professionalMembershipId) return { count: 0 };
            if (state.appointmentCount !== 1) return { count: state.appointmentCount };
            Object.assign(work.appointment, data, { updatedAt: now }); return { count: 1 };
          }
        },
        membership: { findFirst: async ({ where }: Prisma.MembershipFindFirstArgs) => {
          state.reads.push('membership');
          return where?.id === state.membership.id && where?.clinicId === state.membership.clinicId && where?.userId === state.membership.userId
            ? state.membership : null;
        } },
        auditEvent: { create: async ({ data }: Prisma.AuditEventCreateArgs) => {
          state.writes.push('audit');
          if (state.failAuditAt && work.audits.length + 1 === state.failAuditAt) throw new Error('audit failed');
          work.audits.push(data as Prisma.AuditEventCreateInput); return data;
        } }
      } as unknown as Tx;
      const result = await callback(tx);
      state.beforeCommit?.(state.transactions);
      state.encounter = work.encounter; state.appointment = work.appointment; state.audits = work.audits;
      return result;
    }
  };
  const service = new DentalCareService(repository, new FakeClock(now));
  // Projection for the existing ClinicalEncounterService DTO mapper, after commit.
  const detail = () => state.encounter ? {
    ...state.encounter, reasonForVisit: null, relevantHistory: null, allergies: null, currentMedications: null,
    physicalExamination: null, indications: null, clinicalNotes: null,
    patient: { id: 'patient', firstName: 'Ana', lastName: 'Perez', secondLastName: null, birthDate: null, sexAtBirth: null },
    professional: { user: { firstName: 'Dra', lastName: 'Uno' } },
    finalizedBy: state.encounter.finalizedByMembershipId ? { user: { firstName: 'Dra', lastName: 'Uno' } } : null,
    appointment: state.appointment, vitalSigns: null, diagnoses: [], procedures: [], amendments: []
  } : null;
  const clinicalRepository = { ...repository, clinicalEncounter: { findFirst: async () => detail() } } as unknown as IClinicalEncounterRepository;
  return { state, snapshot, repository, detail, service,
    clinicalService: new ClinicalEncounterService(clinicalRepository),
    finalize: (version = 7, context = actor) => service.finalizeCare(context, encounterId, version) };
}

function errorCode(promise: Promise<unknown>, code: string, statusCode = 409) {
  return assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code && error.statusCode === statusCode);
}
function conflict() {
  return new Prisma.PrismaClientKnownRequestError('simulated serialization conflict', { code: 'P2034', clientVersion: 'test' });
}

for (const linked of [false, true]) {
  test(`${linked ? 'linked' : 'independent'} DRAFT closes, increments once and retry preserves dates and authorship`, async () => {
    const f = fixture(linked ? 'IN_PROGRESS' : null);
    await f.finalize();
    assert.equal(f.state.encounter?.status, 'FINALIZED');
    assert.equal(f.state.encounter?.version, 8);
    assert.deepEqual(f.state.encounter?.finalizedAt, now);
    assert.equal(f.state.encounter?.finalizedByMembershipId, actor.membershipId);
    assert.equal(f.state.encounter?.updatedByMembershipId, actor.membershipId);
    assert.equal(f.state.encounter?.createdByMembershipId, 'original-author');
    assert.deepEqual(f.state.encounter?.occurredAt, earlier);
    assert.equal(f.state.appointment?.status ?? null, linked ? 'COMPLETED' : null);
    assert.deepEqual(f.state.audits.map(a => a.action), linked
      ? ['CLINICAL_ENCOUNTER_FINALIZED', 'APPOINTMENT_STATUS_CHANGED'] : ['CLINICAL_ENCOUNTER_FINALIZED']);
    assert.deepEqual(f.state.audits[0]?.metadata, { previousStatus: 'DRAFT', status: 'FINALIZED', version: 8 });
    if (linked) {
      assert.deepEqual(f.state.audits[1]?.metadata, { appointmentId: 'appointment', previousStatus: 'IN_PROGRESS', newStatus: 'COMPLETED' });
      assert.deepEqual(f.state.writes.slice(0, 2), ['appointment', 'encounter']);
      assert.deepEqual(f.state.reads.slice(0, 3), ['link', 'appointment', 'encounter']);
    } else {
      assert.ok(!f.state.reads.includes('appointment')); assert.ok(!f.state.writes.includes('appointment'));
    }
    const committed = f.snapshot(); f.state.writes = [];
    await f.finalize(7);
    assert.deepEqual(f.snapshot(), committed); assert.deepEqual(f.state.writes, []);
  });
  test(`${linked ? 'linked' : 'independent'} already FINALIZED is authorized and idempotent even with stale version`, async () => {
    const f = fixture(linked ? 'COMPLETED' : null, 'FINALIZED');
    const before = f.snapshot(); await f.finalize(1);
    assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.state.writes, []);
  });
  test(`${linked ? 'linked' : 'independent'} stale DRAFT version returns existing conflict without writes`, async () => {
    const f = fixture(linked ? 'IN_PROGRESS' : null);
    const before = f.snapshot(); await errorCode(f.finalize(6), 'CLINICAL_ENCOUNTER_VERSION_CONFLICT');
    assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.state.writes, []);
  });
}

for (const appointment of ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const) {
  for (const encounter of ['DRAFT', 'FINALIZED'] as const) {
    if ((appointment === 'IN_PROGRESS' && encounter === 'DRAFT') || (appointment === 'COMPLETED' && encounter === 'FINALIZED')) continue;
    test(`${appointment}/${encounter} rejects inconsistency before version validation`, async () => {
      const f = fixture(appointment, encounter); const before = f.snapshot();
      await errorCode(f.finalize(1), 'CARE_STATE_INCONSISTENT');
      assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.state.writes, []);
    });
  }
}

for (const linked of [false, true]) {
  for (const finalized of [false, true]) {
    for (const role of ['PROFESSIONAL', 'OWNER', 'ASSISTANT']) {
      test(`${role} unauthorized on ${linked ? 'linked' : 'independent'} ${finalized ? 'idempotent recovery' : 'closure'}`, async () => {
        const f = fixture(linked ? (finalized ? 'COMPLETED' : 'IN_PROGRESS') : null, finalized ? 'FINALIZED' : 'DRAFT');
        f.state.membership.role = role;
        if (role !== 'ASSISTANT') f.state.encounter!.professionalMembershipId = 'other';
        await errorCode(f.finalize(7, { ...actor, role }), 'FORBIDDEN', 403);
        assert.deepEqual(f.state.writes, []);
      });
    }
  }
}
test('assigned OWNER can finalize without requiring a professional profile or active patient', async () => {
  const f = fixture(); f.state.membership.role = 'OWNER';
  // Fake has no profile or patient delegate: neither is a prerequisite for closure.
  await f.finalize(7, { ...actor, role: 'OWNER' }); assert.equal(f.state.encounter?.status, 'FINALIZED');
});
for (const condition of ['missing', 'inactive', 'disabledUser', 'roleMismatch'] as const) {
  test(`${condition} membership/user rejects idempotent recovery`, async () => {
    const f = fixture('COMPLETED', 'FINALIZED');
    if (condition === 'missing') f.state.membership.id = 'different';
    if (condition === 'inactive') f.state.membership.status = 'SUSPENDED';
    if (condition === 'disabledUser') f.state.membership.user.status = 'DISABLED';
    if (condition === 'roleMismatch') f.state.membership.role = 'OWNER';
    await errorCode(f.finalize(), 'FORBIDDEN', 403); assert.deepEqual(f.state.writes, []);
  });
}
test('encounter of another clinic returns 404', async () => {
  const f = fixture(); await errorCode(f.finalize(7, { ...actor, clinicId: 'other' }), 'NOT_FOUND', 404);
  assert.deepEqual(f.state.reads, ['link']);
});
for (const missing of [false, true]) {
  test(`${missing ? 'missing' : 'other-clinic'} linked appointment returns 404`, async () => {
    const f = fixture(); if (missing) f.state.appointment = null; else f.state.appointment!.clinicId = 'other';
    await errorCode(f.finalize(), 'NOT_FOUND', 404); assert.deepEqual(f.state.writes, []);
  });
}
for (const field of ['patientId', 'professionalMembershipId'] as const) {
  test(`appointment ${field} mismatch is not repaired`, async () => {
    const f = fixture(); f.state.appointment![field] = 'other';
    await errorCode(f.finalize(), 'CARE_STATE_INCONSISTENT'); assert.deepEqual(f.state.writes, []);
  });
}

for (const failure of ['appointment', 'encounter', 'audit1', 'audit2'] as const) {
  test(`${failure} failure rolls back the complete operation without retry`, async () => {
    const f = fixture(); const before = f.snapshot();
    if (failure === 'appointment') f.state.failAppointment = new Error('appointment failed');
    if (failure === 'encounter') f.state.failEncounter = new Error('encounter failed');
    if (failure === 'audit1') f.state.failAuditAt = 1;
    if (failure === 'audit2') f.state.failAuditAt = 2;
    await assert.rejects(f.finalize(), /failed/);
    assert.deepEqual(f.snapshot(), before); assert.equal(f.state.transactions, 1);
  });
}
test('encounter CAS failure rolls back the prior appointment update', async () => {
  const f = fixture(); const before = f.snapshot(); f.state.encounterCount = 0;
  await errorCode(f.finalize(), 'CLINICAL_ENCOUNTER_VERSION_CONFLICT'); assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.state.writes, ['appointment', 'encounter']);
});
test('appointment conditional update failure does not finalize encounter', async () => {
  const f = fixture(); const before = f.snapshot(); f.state.appointmentCount = 0;
  await errorCode(f.finalize(), 'CARE_STATE_INCONSISTENT'); assert.deepEqual(f.snapshot(), before);
});
test('P2034 after writes rolls back and retries with a fresh transaction', async () => {
  const f = fixture(); const before = f.snapshot();
  f.state.beforeCommit = attempt => { if (attempt === 1) throw conflict(); };
  f.state.beforeAttempt = attempt => { if (attempt === 2) assert.deepEqual(f.snapshot(), before); };
  await f.finalize(); assert.equal(f.state.transactions, 2);
  assert.equal(f.state.encounter?.version, 8); assert.equal(f.state.audits.length, 2);
});
test('concurrent finalizer winner is recovered on retry without a second increment or audits', async () => {
  const f = fixture();
  const winner = fixture(); await winner.finalize();
  f.state.beforeCommit = attempt => { if (attempt === 1) throw conflict(); };
  f.state.beforeAttempt = attempt => {
    if (attempt === 2) Object.assign(f.state, winner.snapshot());
  };
  await f.finalize(7); assert.equal(f.state.transactions, 2); assert.deepEqual(f.snapshot(), winner.snapshot());
});
test('concurrent draft edit observed on retry returns version conflict', async () => {
  const f = fixture();
  f.state.beforeCommit = attempt => { if (attempt === 1) throw conflict(); };
  f.state.beforeAttempt = attempt => { if (attempt === 2) f.state.encounter!.version = 8; };
  await errorCode(f.finalize(7), 'CLINICAL_ENCOUNTER_VERSION_CONFLICT');
  assert.equal(f.state.appointment?.status, 'IN_PROGRESS'); assert.equal(f.state.encounter?.status, 'DRAFT');
  assert.equal(f.state.audits.length, 0);
});
test('P2034 exhaustion returns CONCURRENCY_ERROR 409 after three rollbacks', async () => {
  const f = fixture(); const before = f.snapshot(); f.state.beforeCommit = () => { throw conflict(); };
  await errorCode(f.finalize(), 'CONCURRENCY_ERROR'); assert.equal(f.state.transactions, 3);
  assert.deepEqual(f.snapshot(), before);
});
test('P2002 is not retried by finalization', async () => {
  const f = fixture(); const error = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
  f.state.failAppointment = error; await assert.rejects(f.finalize(), e => e === error);
  assert.equal(f.state.transactions, 1);
});

for (const linked of [false, true]) {
  test(`existing clinical service returns the current DTO after ${linked ? 'linked' : 'independent'} closure and recovery`, async () => {
    const f = fixture(linked ? 'IN_PROGRESS' : null);
    const close = () => f.clinicalService.finalizeEncounter('clinic', encounterId, 'professional', 'user', 'PROFESSIONAL', 7);
    const result = await close();
    assert.equal(result.status, 'FINALIZED'); assert.equal(result.version, 8);
    assert.equal(result.appointment?.status ?? null, linked ? 'COMPLETED' : null);
    assert.deepEqual(await close(), result);
  });
}
test('existing finalize controller responds 200 with unchanged DTO contract for closure and recovery', async (t) => {
  const f = fixture();
  const originalTransaction = prisma.$transaction;
  const originalFind = prisma.clinicalEncounter.findFirst;
  prisma.$transaction = f.repository.$transaction.bind(f.repository) as typeof prisma.$transaction;
  prisma.clinicalEncounter.findFirst = (async () => f.detail()) as typeof prisma.clinicalEncounter.findFirst;
  t.after(() => { prisma.$transaction = originalTransaction; prisma.clinicalEncounter.findFirst = originalFind; });
  let status = 200; const bodies: Array<Record<string, unknown>> = [];
  const res = { status(code: number) { status = code; return this; },
    json(value: Record<string, unknown>) { bodies.push(value); return this; } } as Response;
  const request = { authContext: actor, params: { id: encounterId }, body: { version: 7 } } as unknown as Request;
  const next = (error?: unknown) => { if (error) throw error; };
  await ClinicalEncounterController.finalize(request, res, next);
  await ClinicalEncounterController.finalize(request, res, next);
  assert.equal(status, 200); assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[0]?.status, 'FINALIZED');
  assert.equal((bodies[0]?.appointment as { status: string }).status, 'COMPLETED');
  assert.equal('created' in bodies[0]!, false); assert.equal(f.state.audits.length, 2);
});
