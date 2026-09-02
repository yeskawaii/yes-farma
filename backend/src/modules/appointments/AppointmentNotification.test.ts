import test from 'node:test';
import assert from 'node:assert/strict';
import { AppointmentService } from './application/AppointmentService';
import { AppointmentNotificationOutboxAdapter } from '../notifications/infrastructure/AppointmentNotificationOutboxAdapter';
import { FakeClock } from '../../shared/clock/ClockPort';

interface InMemoryDb {
  appointments: Map<string, any>;
  patients: Map<string, any>;
  memberships: Map<string, any>;
  auditEvents: any[];
  notificationSettings: Map<string, any>;
  notificationJobs: Map<string, any>;
  transactionCalls: number;
  throwOnOutbox?: boolean;
}

const createMockRepository = (initialData: Partial<InMemoryDb> = {}) => {
  const db: InMemoryDb = {
    appointments: new Map(),
    patients: new Map([
      ['p1', { id: 'p1', clinicId: 'c1', firstName: 'Juan', lastName: 'Perez', status: 'ACTIVE', phone: null }]
    ]),
    memberships: new Map([
      ['prof-1', { id: 'prof-1', clinicId: 'c1', status: 'ACTIVE', role: 'PROFESSIONAL' }],
      ['prof-2', { id: 'prof-2', clinicId: 'c1', status: 'ACTIVE', role: 'PROFESSIONAL' }],
      ['owner-1', { id: 'owner-1', clinicId: 'c1', status: 'ACTIVE', role: 'OWNER' }]
    ]),
    auditEvents: [],
    notificationSettings: new Map(),
    notificationJobs: new Map(),
    transactionCalls: 0,
    ...initialData
  };

  const createTx = () => ({
    patient: {
      findFirst: async (args: any) => {
        const p = db.patients.get(args.where.id);
        if (p && p.clinicId === args.where.clinicId) return p;
        return null;
      }
    },
    membership: {
      findFirst: async (args: any) => {
        const m = db.memberships.get(args.where.id);
        if (m && m.clinicId === args.where.clinicId) return m;
        return null;
      }
    },
    appointment: {
      findFirst: async (args: any) => {
        for (const app of db.appointments.values()) {
          if (app.clinicId !== args.where.clinicId) continue;
          if (args.where.id && app.id !== args.where.id) continue;
          if (args.where.id?.not && app.id === args.where.id.not) continue;
          if (args.where.professionalMembershipId && app.professionalMembershipId !== args.where.professionalMembershipId) continue;
          if (args.where.status?.in && !args.where.status.in.includes(app.status)) continue;
          if (args.where.startAt?.lt && !(app.startAt < args.where.startAt.lt)) continue;
          if (args.where.endAt?.gt && !(app.endAt > args.where.endAt.gt)) continue;
          return app;
        }
        return null;
      },
      create: async (args: any) => {
        const id = args.data.id || `app-${db.appointments.size + 1}`;
        const app = { id, ...args.data };
        db.appointments.set(id, app);
        return app;
      },
      update: async (args: any) => {
        const app = db.appointments.get(args.where.id);
        if (!app) throw new Error('Not found');
        const updated = { ...app, ...args.data };
        db.appointments.set(args.where.id, updated);
        return updated;
      }
    },
    auditEvent: {
      create: async (args: any) => {
        const event = { id: `audit-${db.auditEvents.length + 1}`, ...args.data };
        db.auditEvents.push(event);
        return event;
      }
    },
    clinicNotificationSettings: {
      findUnique: async (args: any) => {
        return db.notificationSettings.get(args.where.clinicId) || null;
      }
    },
    notificationJob: {
      findUnique: async (args: any) => {
        if (db.throwOnOutbox) {
          throw new Error('Database connection failed querying outbox job');
        }
        const key = `${args.where.clinicId_idempotencyKey.clinicId}:${args.where.clinicId_idempotencyKey.idempotencyKey}`;
        return db.notificationJobs.get(key) || null;
      },
      create: async (args: any) => {
        if (db.throwOnOutbox) {
          throw new Error('Database connection failed writing outbox job');
        }
        const key = `${args.data.clinicId}:${args.data.idempotencyKey}`;
        const id = `job-${db.notificationJobs.size + 1}`;
        const created = {
          id,
          attempts: 0,
          nextAttemptAt: null,
          processingStartedAt: null,
          sentAt: null,
          providerMessageId: null,
          failureCode: null,
          ...args.data
        };
        db.notificationJobs.set(key, created);
        return created;
      },
      update: async (args: any) => {
        if (db.throwOnOutbox) {
          throw new Error('Database connection failed updating outbox job');
        }
        const key = `${args.where.clinicId_idempotencyKey.clinicId}:${args.where.clinicId_idempotencyKey.idempotencyKey}`;
        const existing = db.notificationJobs.get(key);
        if (!existing) throw new Error('Not found');
        const updated = { ...existing, ...args.data };
        db.notificationJobs.set(key, updated);
        return updated;
      },
      updateMany: async (args: any) => {
        if (db.throwOnOutbox) {
          throw new Error('Database connection failed updating outbox jobs');
        }
        let count = 0;
        for (const [key, job] of db.notificationJobs.entries()) {
          if (args.where.clinicId && job.clinicId !== args.where.clinicId) continue;
          if (args.where.appointmentId && job.appointmentId !== args.where.appointmentId) continue;
          if (args.where.type && job.type !== args.where.type) continue;
          if (args.where.status?.in && !args.where.status.in.includes(job.status)) continue;

          db.notificationJobs.set(key, { ...job, ...args.data });
          count++;
        }
        return { count };
      }
    }
  });

  const repo = {
    appointment: {
      findMany: async () => Array.from(db.appointments.values()),
      findFirst: async (args: any) => {
        for (const app of db.appointments.values()) {
          if (app.clinicId === args.where.clinicId && app.id === args.where.id) return app;
        }
        return null;
      }
    },
    membership: {
      findMany: async () => Array.from(db.memberships.values())
    },
    $transaction: async (cb: any) => {
      db.transactionCalls++;
      const snapshot = {
        appointments: new Map(db.appointments),
        auditEvents: [...db.auditEvents],
        notificationJobs: new Map(db.notificationJobs)
      };
      try {
        const tx = createTx();
        return await cb(tx);
      } catch (err) {
        db.appointments = snapshot.appointments;
        db.auditEvents = snapshot.auditEvents;
        db.notificationJobs = snapshot.notificationJobs;
        throw err;
      }
    }
  };

  return { repo, db };
};

test('Appointment Notifications V1 - Phase A Foundation Rules', async (t) => {
  const baseTime = new Date('2026-09-01T12:00:00.000Z');

  await t.test('1. settings inexistentes -> no reminder', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository();
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.ok(app);
    assert.strictEqual(db.notificationJobs.size, 0);
  });

  await t.test('2. whatsappEnabled=false -> no reminder', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: false, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 0);
  });

  await t.test('3. appointmentReminder24hEnabled=false -> no reminder', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: false }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 0);
  });

  await t.test('4. reminder habilitado y cita >24h -> crea exactamente un job', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 1);
    const job = Array.from(db.notificationJobs.values())[0];
    assert.ok(job);
    assert.strictEqual(job.appointmentId, app.id);
    assert.strictEqual(job.clinicId, 'c1');
    assert.strictEqual(job.type, 'APPOINTMENT_REMINDER_24H');
    assert.strictEqual(job.channel, 'WHATSAPP');
    assert.strictEqual(job.status, 'PENDING');
  });

  await t.test('5. scheduledFor = startAt - 24h', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');
    const expectedScheduledFor = new Date('2026-09-02T10:00:00.000Z');

    await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    const job = Array.from(db.notificationJobs.values())[0];
    assert.ok(job);
    assert.strictEqual(job.scheduledFor.toISOString(), expectedScheduledFor.toISOString());
    assert.strictEqual(job.appointmentStartAtSnapshot.toISOString(), appStart.toISOString());
  });

  await t.test('6. cita con scheduledFor <= now -> no job', async () => {
    const clock = new FakeClock(new Date('2026-09-02T10:00:00.000Z'));
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    // Cita en 20 horas: scheduledFor sería hace 4 horas (en el pasado)
    const appStart = new Date('2026-09-03T06:00:00.000Z');
    const appEnd = new Date('2026-09-03T06:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.ok(app);
    assert.strictEqual(app.status, 'SCHEDULED');
    assert.strictEqual(db.notificationJobs.size, 0);
  });

  await t.test('7. creación equivalente repetida/idempotencia -> no duplicado', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const params = { clinicId: 'c1', appointmentId: 'app-1', startAt: appStart };

    await repo.$transaction(async (tx: any) => {
      await outbox.scheduleAppointmentReminder(tx, params);
    });

    assert.strictEqual(db.notificationJobs.size, 1);

    await repo.$transaction(async (tx: any) => {
      await outbox.scheduleAppointmentReminder(tx, params);
    });

    assert.strictEqual(db.notificationJobs.size, 1);
  });

  await t.test('8. reprogramación cancela reminder PENDING anterior', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart1 = new Date('2026-09-03T10:00:00.000Z');
    const appEnd1 = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart1.toISOString(),
      endAt: appEnd1.toISOString()
    }, 'OWNER');

    const appStart2 = new Date('2026-09-04T11:00:00.000Z');
    const appEnd2 = new Date('2026-09-04T11:30:00.000Z');

    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: appStart2.toISOString(),
      endAt: appEnd2.toISOString()
    });

    const jobs = Array.from(db.notificationJobs.values());
    assert.strictEqual(jobs.length, 2);

    const oldJob = jobs.find((j: any) => j.appointmentStartAtSnapshot.toISOString() === appStart1.toISOString());
    const newJob = jobs.find((j: any) => j.appointmentStartAtSnapshot.toISOString() === appStart2.toISOString());

    assert.ok(oldJob);
    assert.ok(newJob);
    assert.strictEqual(oldJob.status, 'CANCELLED');
    assert.strictEqual(newJob.status, 'PENDING');
  });

  await t.test('9. reprogramación cancela reminder RETRY_PENDING anterior', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart1 = new Date('2026-09-03T10:00:00.000Z');
    const appEnd1 = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart1.toISOString(),
      endAt: appEnd1.toISOString()
    }, 'OWNER');

    // Cambiar el estado del job a RETRY_PENDING
    const jobKey = Array.from(db.notificationJobs.keys())[0];
    assert.ok(jobKey);
    const existingJob = db.notificationJobs.get(jobKey);
    assert.ok(existingJob);
    db.notificationJobs.set(jobKey, { ...existingJob, status: 'RETRY_PENDING' });

    const appStart2 = new Date('2026-09-04T11:00:00.000Z');
    const appEnd2 = new Date('2026-09-04T11:30:00.000Z');

    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: appStart2.toISOString(),
      endAt: appEnd2.toISOString()
    });

    const oldJob = db.notificationJobs.get(jobKey);
    assert.ok(oldJob);
    assert.strictEqual(oldJob.status, 'CANCELLED');
  });

  await t.test('10. reprogramación no altera un reminder SENT', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart1 = new Date('2026-09-03T10:00:00.000Z');
    const appEnd1 = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart1.toISOString(),
      endAt: appEnd1.toISOString()
    }, 'OWNER');

    const jobKey = Array.from(db.notificationJobs.keys())[0];
    assert.ok(jobKey);
    const existingJob = db.notificationJobs.get(jobKey);
    assert.ok(existingJob);
    db.notificationJobs.set(jobKey, { ...existingJob, status: 'SENT', sentAt: new Date() });

    const appStart2 = new Date('2026-09-04T11:00:00.000Z');
    const appEnd2 = new Date('2026-09-04T11:30:00.000Z');

    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: appStart2.toISOString(),
      endAt: appEnd2.toISOString()
    });

    const sentJob = db.notificationJobs.get(jobKey);
    assert.ok(sentJob);
    assert.strictEqual(sentJob.status, 'SENT');
  });

  await t.test('11. reprogramación genera nuevo reminder para nuevo startAt si corresponde', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart1 = new Date('2026-09-03T10:00:00.000Z');
    const appEnd1 = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart1.toISOString(),
      endAt: appEnd1.toISOString()
    }, 'OWNER');

    const appStart2 = new Date('2026-09-05T14:00:00.000Z');
    const appEnd2 = new Date('2026-09-05T14:30:00.000Z');

    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: appStart2.toISOString(),
      endAt: appEnd2.toISOString()
    });

    const jobs = Array.from(db.notificationJobs.values());
    const newJob = jobs.find((j: any) => j.appointmentStartAtSnapshot.toISOString() === appStart2.toISOString());
    assert.ok(newJob);
    assert.strictEqual(newJob.status, 'PENDING');
    assert.strictEqual(newJob.scheduledFor.toISOString(), new Date('2026-09-04T14:00:00.000Z').toISOString());
  });

  await t.test('12. cambio exclusivo de reason/administrativeNotes no recrea reminder', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString(),
      reason: 'Consulta general'
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 1);

    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      reason: 'Limpieza dental',
      administrativeNotes: 'Traer radiografías'
    });

    assert.strictEqual(db.notificationJobs.size, 1);
    const job = Array.from(db.notificationJobs.values())[0];
    assert.ok(job);
    assert.strictEqual(job.status, 'PENDING');
  });

  await t.test('13. cancelAppointment cancela PENDING', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    await service.cancelAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      cancellationReason: 'Paciente cancela'
    });

    const job = Array.from(db.notificationJobs.values())[0];
    assert.ok(job);
    assert.strictEqual(job.status, 'CANCELLED');
  });

  await t.test('14. cancelAppointment cancela RETRY_PENDING', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    const jobKey = Array.from(db.notificationJobs.keys())[0];
    assert.ok(jobKey);
    const existingJob = db.notificationJobs.get(jobKey);
    assert.ok(existingJob);
    db.notificationJobs.set(jobKey, { ...existingJob, status: 'RETRY_PENDING' });

    await service.cancelAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      cancellationReason: 'Cancelada'
    });

    const job = db.notificationJobs.get(jobKey);
    assert.ok(job);
    assert.strictEqual(job.status, 'CANCELLED');
  });

  await t.test('15. cancelAppointment no altera SENT', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    const jobKey = Array.from(db.notificationJobs.keys())[0];
    assert.ok(jobKey);
    const existingJob = db.notificationJobs.get(jobKey);
    assert.ok(existingJob);
    db.notificationJobs.set(jobKey, { ...existingJob, status: 'SENT', sentAt: new Date() });

    await service.cancelAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      cancellationReason: 'Cancelada'
    });

    const job = db.notificationJobs.get(jobKey);
    assert.ok(job);
    assert.strictEqual(job.status, 'SENT');
  });

  await t.test('16. configuración deshabilitada durante reprogramación -> cancela reminder antiguo y no genera nuevo', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart1 = new Date('2026-09-03T10:00:00.000Z');
    const appEnd1 = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart1.toISOString(),
      endAt: appEnd1.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 1);

    // Deshabilitar settings antes de reprogramar
    db.notificationSettings.set('c1', { clinicId: 'c1', whatsappEnabled: false, appointmentReminder24hEnabled: false });

    const appStart2 = new Date('2026-09-05T10:00:00.000Z');
    const appEnd2 = new Date('2026-09-05T10:30:00.000Z');

    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: appStart2.toISOString(),
      endAt: appEnd2.toISOString()
    });

    const jobs = Array.from(db.notificationJobs.values());
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0]?.status, 'CANCELLED');
  });

  await t.test('17. appointment + audit + outbox comparten la misma transacción', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    assert.strictEqual(db.transactionCalls, 0);

    await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.transactionCalls, 1);
    assert.strictEqual(db.appointments.size, 1);
    assert.strictEqual(db.auditEvents.length, 1);
    assert.strictEqual(db.notificationJobs.size, 1);
  });

  await t.test('18. error inesperado de outbox provoca rollback lógico/propagación de la operación', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ]),
      throwOnOutbox: true
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    await assert.rejects(
      service.createAppointment('c1', 'prof-1', 'u1', {
        patientId: 'p1',
        professionalMembershipId: 'prof-1',
        startAt: appStart.toISOString(),
        endAt: appEnd.toISOString()
      }, 'OWNER'),
      /Database connection failed querying outbox job/
    );

    // Rollback verificado: la cita y el auditEvent no persisten
    assert.strictEqual(db.appointments.size, 0);
    assert.strictEqual(db.auditEvents.length, 0);
    assert.strictEqual(db.notificationJobs.size, 0);
  });

  await t.test('19. ClockPort permite prueba determinística sin depender de la hora real', async () => {
    const clock = new FakeClock('2026-09-01T00:00:00.000Z');
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    // Cita a las 2026-09-02T12:00:00Z (scheduledFor = 2026-09-01T12:00:00Z > clock.now())
    const appStart = new Date('2026-09-02T12:00:00.000Z');
    const appEnd = new Date('2026-09-02T12:30:00.000Z');

    await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 1);

    // Avanzar reloj 13 horas: ahora son las 2026-09-01T13:00:00Z (scheduledFor ya quedó en el pasado)
    clock.advanceByMs(13 * 60 * 60 * 1000);

    const appStart2 = new Date('2026-09-02T12:00:00.000Z');
    const appEnd2 = new Date('2026-09-02T12:30:00.000Z');

    const app2 = await service.createAppointment('c1', 'prof-2', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-2',
      startAt: appStart2.toISOString(),
      endAt: appEnd2.toISOString()
    }, 'OWNER');

    assert.ok(app2);
    // Sigue habiendo 1 solo job porque la segunda cita no generó job al estar a <= 24h
    assert.strictEqual(db.notificationJobs.size, 1);
  });

  await t.test('20. no se requiere Patient.phone para crear NotificationJob', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      patients: new Map([
        ['p1', { id: 'p1', clinicId: 'c1', firstName: 'Sin', lastName: 'Telefono', status: 'ACTIVE', phone: null }]
      ]),
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.ok(app);
    assert.strictEqual(db.notificationJobs.size, 1);
    const job = Array.from(db.notificationJobs.values())[0];
    assert.ok(job);
    assert.strictEqual(job.recipientPhone, undefined);
    assert.strictEqual(job.status, 'PENDING');
  });

  await t.test('21. cambio solo de professionalMembershipId conserva reminder PENDING original y no crea otro', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 1);
    const jobBefore = Array.from(db.notificationJobs.values())[0];
    assert.ok(jobBefore);
    assert.strictEqual(jobBefore.status, 'PENDING');

    // Cambiar solo el profesional asignado
    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      professionalMembershipId: 'prof-2'
    });

    // Debe seguir habiendo exactamente 1 job y su status debe seguir siendo PENDING (no CANCELLED ni recreado)
    assert.strictEqual(db.notificationJobs.size, 1);
    const jobAfter = Array.from(db.notificationJobs.values())[0];
    assert.ok(jobAfter);
    assert.strictEqual(jobAfter.id, jobBefore.id);
    assert.strictEqual(jobAfter.status, 'PENDING');
  });

  await t.test('22. cambio solo de endAt conserva reminder PENDING original y no crea otro', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 1);
    const jobBefore = Array.from(db.notificationJobs.values())[0];
    assert.ok(jobBefore);

    // Cambiar solo endAt (mismo startAt)
    const newEnd = new Date('2026-09-03T11:00:00.000Z');
    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: appStart.toISOString(),
      endAt: newEnd.toISOString()
    });

    assert.strictEqual(db.notificationJobs.size, 1);
    const jobAfter = Array.from(db.notificationJobs.values())[0];
    assert.ok(jobAfter);
    assert.strictEqual(jobAfter.id, jobBefore.id);
    assert.strictEqual(jobAfter.status, 'PENDING');
  });

  await t.test('23. cambio de startAt cancela reminder anterior y crea uno nuevo', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const appStart1 = new Date('2026-09-03T10:00:00.000Z');
    const appEnd1 = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart1.toISOString(),
      endAt: appEnd1.toISOString()
    }, 'OWNER');

    const appStart2 = new Date('2026-09-04T15:00:00.000Z');
    const appEnd2 = new Date('2026-09-04T15:30:00.000Z');

    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: appStart2.toISOString(),
      endAt: appEnd2.toISOString()
    });

    const jobs = Array.from(db.notificationJobs.values());
    assert.strictEqual(jobs.length, 2);

    const oldJob = jobs.find((j: any) => j.appointmentStartAtSnapshot.toISOString() === appStart1.toISOString());
    const newJob = jobs.find((j: any) => j.appointmentStartAtSnapshot.toISOString() === appStart2.toISOString());

    assert.ok(oldJob);
    assert.ok(newJob);
    assert.strictEqual(oldJob.status, 'CANCELLED');
    assert.strictEqual(newJob.status, 'PENDING');
    assert.strictEqual(newJob.scheduledFor.toISOString(), new Date('2026-09-03T15:00:00.000Z').toISOString());
  });

  await t.test('24. cambio de startAt hacia <=24h cancela anterior y no crea reminder atrasado', async () => {
    const clock = new FakeClock(new Date('2026-09-02T10:00:00.000Z'));
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    // Cita inicial a 48h (crea reminder)
    const appStart1 = new Date('2026-09-04T10:00:00.000Z');
    const appEnd1 = new Date('2026-09-04T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart1.toISOString(),
      endAt: appEnd1.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 1);
    const oldJob = Array.from(db.notificationJobs.values())[0];
    assert.ok(oldJob);
    assert.strictEqual(oldJob.status, 'PENDING');

    // Reprogramar para dentro de 12 horas: scheduledFor sería hace 12h (en el pasado respecto al clock)
    const appStart2 = new Date('2026-09-02T22:00:00.000Z');
    const appEnd2 = new Date('2026-09-02T22:30:00.000Z');

    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: appStart2.toISOString(),
      endAt: appEnd2.toISOString()
    });

    // Se debe haber cancelado el anterior y NO debe haber creado nuevo
    const jobs = Array.from(db.notificationJobs.values());
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0]?.status, 'CANCELLED');
  });

  await t.test('25. AppointmentService por defecto utiliza NoopAppointmentNotificationPort sin errores', async () => {
    const { repo } = createMockRepository();
    const service = new AppointmentService(repo as any); // default Noop

    const appStart = new Date('2026-09-03T10:00:00.000Z');
    const appEnd = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: appStart.toISOString(),
      endAt: appEnd.toISOString()
    }, 'OWNER');

    assert.ok(app);
    assert.strictEqual(app.status, 'SCHEDULED');
  });

  await t.test('26. A -> B -> A: el reminder A original CANCELLED se reactiva PENDING; B queda CANCELLED; existen solamente 2 jobs, no 3', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const startA = new Date('2026-09-03T10:00:00.000Z');
    const endA = new Date('2026-09-03T10:30:00.000Z');

    // 1. Crear cita en horario A
    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: startA.toISOString(),
      endAt: endA.toISOString()
    }, 'OWNER');

    assert.strictEqual(db.notificationJobs.size, 1);

    // 2. Reprogramar a horario B
    const startB = new Date('2026-09-04T10:00:00.000Z');
    const endB = new Date('2026-09-04T10:30:00.000Z');
    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: startB.toISOString(),
      endAt: endB.toISOString()
    });

    assert.strictEqual(db.notificationJobs.size, 2);

    // 3. Reprogramar de regreso a horario A
    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: startA.toISOString(),
      endAt: endA.toISOString()
    });

    // Existen exactamente 2 jobs, no 3
    assert.strictEqual(db.notificationJobs.size, 2);

    const jobs = Array.from(db.notificationJobs.values());
    const jobA = jobs.find((j: any) => j.appointmentStartAtSnapshot.toISOString() === startA.toISOString());
    const jobB = jobs.find((j: any) => j.appointmentStartAtSnapshot.toISOString() === startB.toISOString());

    assert.ok(jobA);
    assert.ok(jobB);
    assert.strictEqual(jobA.status, 'PENDING');
    assert.strictEqual(jobB.status, 'CANCELLED');
  });

  await t.test('27. Al reactivar A: scheduledFor vuelve a A - 24h; appointmentStartAtSnapshot vuelve a A; attempts=0; nextAttemptAt=null; processingStartedAt=null; failureCode=null', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const startA = new Date('2026-09-03T10:00:00.000Z');
    const endA = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: startA.toISOString(),
      endAt: endA.toISOString()
    }, 'OWNER');

    // Simular que el job A tuvo un fallo previo antes de ser cancelado
    const keyA = Array.from(db.notificationJobs.keys())[0]!;
    const jobAEntry = db.notificationJobs.get(keyA);
    db.notificationJobs.set(keyA, {
      ...jobAEntry,
      attempts: 2,
      nextAttemptAt: new Date(),
      processingStartedAt: new Date(),
      failureCode: 'SOME_ERROR'
    });

    // Reprogramar A -> B
    const startB = new Date('2026-09-04T10:00:00.000Z');
    const endB = new Date('2026-09-04T10:30:00.000Z');
    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: startB.toISOString(),
      endAt: endB.toISOString()
    });

    // Reprogramar B -> A
    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: startA.toISOString(),
      endAt: endA.toISOString()
    });

    const reactivatedA = db.notificationJobs.get(keyA);
    assert.ok(reactivatedA);
    assert.strictEqual(reactivatedA.status, 'PENDING');
    assert.strictEqual(reactivatedA.scheduledFor.toISOString(), new Date('2026-09-02T10:00:00.000Z').toISOString());
    assert.strictEqual(reactivatedA.appointmentStartAtSnapshot.toISOString(), startA.toISOString());
    assert.strictEqual(reactivatedA.attempts, 0);
    assert.strictEqual(reactivatedA.nextAttemptAt, null);
    assert.strictEqual(reactivatedA.processingStartedAt, null);
    assert.strictEqual(reactivatedA.sentAt, null);
    assert.strictEqual(reactivatedA.providerMessageId, null);
    assert.strictEqual(reactivatedA.failureCode, null);
  });

  await t.test('28. A -> B -> A cuando A ya era SENT: A permanece SENT; B queda CANCELLED; no se crea otro A; no se reactiva SENT', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);
    const service = new AppointmentService(repo as any, outbox);

    const startA = new Date('2026-09-03T10:00:00.000Z');
    const endA = new Date('2026-09-03T10:30:00.000Z');

    const app = await service.createAppointment('c1', 'prof-1', 'u1', {
      patientId: 'p1',
      professionalMembershipId: 'prof-1',
      startAt: startA.toISOString(),
      endAt: endA.toISOString()
    }, 'OWNER');

    // Simular que A fue enviado (SENT)
    const keyA = Array.from(db.notificationJobs.keys())[0]!;
    const jobAEntry = db.notificationJobs.get(keyA);
    const sentDate = new Date('2026-09-02T10:05:00.000Z');
    db.notificationJobs.set(keyA, {
      ...jobAEntry,
      status: 'SENT',
      sentAt: sentDate,
      providerMessageId: 'msg-123'
    });

    // Reprogramar A -> B (A sigue siendo SENT)
    const startB = new Date('2026-09-04T10:00:00.000Z');
    const endB = new Date('2026-09-04T10:30:00.000Z');
    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: startB.toISOString(),
      endAt: endB.toISOString()
    });

    // Reprogramar B -> A
    await service.updateAppointment('c1', app.id, 'owner-1', 'u1', 'OWNER', {
      startAt: startA.toISOString(),
      endAt: endA.toISOString()
    });

    assert.strictEqual(db.notificationJobs.size, 2);

    const jobA = db.notificationJobs.get(keyA);
    assert.ok(jobA);
    assert.strictEqual(jobA.status, 'SENT');
    assert.strictEqual(jobA.sentAt?.toISOString(), sentDate.toISOString());
    assert.strictEqual(jobA.providerMessageId, 'msg-123');

    const jobs = Array.from(db.notificationJobs.values());
    const jobB = jobs.find((j: any) => j.appointmentStartAtSnapshot.toISOString() === startB.toISOString());
    assert.ok(jobB);
    assert.strictEqual(jobB.status, 'CANCELLED');
  });

  await t.test('29. scheduleAppointmentReminder llamado dos veces para la misma key PENDING: sigue existiendo exactamente un job', async () => {
    const clock = new FakeClock(baseTime);
    const { repo, db } = createMockRepository({
      notificationSettings: new Map([
        ['c1', { clinicId: 'c1', whatsappEnabled: true, appointmentReminder24hEnabled: true }]
      ])
    });
    const outbox = new AppointmentNotificationOutboxAdapter(clock);

    const startA = new Date('2026-09-03T10:00:00.000Z');
    const params = { clinicId: 'c1', appointmentId: 'app-1', startAt: startA };

    await repo.$transaction(async (tx: any) => {
      await outbox.scheduleAppointmentReminder(tx, params);
    });

    assert.strictEqual(db.notificationJobs.size, 1);
    const job1 = Array.from(db.notificationJobs.values())[0];
    assert.strictEqual(job1.status, 'PENDING');

    await repo.$transaction(async (tx: any) => {
      await outbox.scheduleAppointmentReminder(tx, params);
    });

    assert.strictEqual(db.notificationJobs.size, 1);
    const job2 = Array.from(db.notificationJobs.values())[0];
    assert.strictEqual(job2.id, job1.id);
    assert.strictEqual(job2.status, 'PENDING');
  });
});
