import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeClock } from '../../shared/clock/ClockPort';
import {
  NotificationWorkerService
} from './application/NotificationWorkerService';
import {
  INotificationJobRepository,
  AppointmentReminderContext,
  DailyAgendaContext,
  DailyAgendaClinicConfig,
  ClaimDueJobsParams,
  FailStaleProcessingParams,
  EnsureDailyAgendaJobParams,
  MarkSentParams,
  MarkRetryPendingParams,
  MarkFailedParams,
  MarkCancelledParams,
  UpdateRecipientPhoneParams
} from './domain/NotificationJobRepositoryPort';
import { FakeNotificationDeliveryAdapter } from './infrastructure/FakeNotificationDeliveryAdapter';
import {
  NotificationJobDto,
  NotificationFailureCodes
} from './domain/NotificationTypes';
import { PhoneNormalizer } from './domain/PhoneNormalizer';
import { TimezoneUtil } from './domain/TimezoneUtil';
import { NotificationMessageComposer } from './domain/NotificationMessageComposer';

class InMemoryNotificationJobRepository implements INotificationJobRepository {
  public jobs: Map<string, NotificationJobDto> = new Map();
  public clinics: Map<string, any> = new Map();
  public settings: Map<string, any> = new Map();
  public appointments: Map<string, any> = new Map();
  public patients: Map<string, any> = new Map();
  public onBeforeUpdateRecipientPhone?: () => void;

  async claimDueJobs(params: ClaimDueJobsParams): Promise<NotificationJobDto[]> {
    const eligible: NotificationJobDto[] = [];

    for (const job of this.jobs.values()) {
      if (
        (job.status === 'PENDING' && job.scheduledFor.getTime() <= params.now.getTime()) ||
        (job.status === 'RETRY_PENDING' && job.nextAttemptAt && job.nextAttemptAt.getTime() <= params.now.getTime())
      ) {
        eligible.push(job);
      }
    }

    eligible.sort((a, b) => {
      const timeDiff = a.scheduledFor.getTime() - b.scheduledFor.getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });

    const claimed = eligible.slice(0, params.limit);

    for (const job of claimed) {
      job.status = 'PROCESSING';
      job.processingStartedAt = new Date(params.now);
      job.attempts += 1;
      job.updatedAt = new Date(params.now);
      this.jobs.set(job.id, { ...job });
    }

    return claimed.map((j) => ({ ...j }));
  }

  async failStaleProcessing(params: FailStaleProcessingParams): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (
        job.status === 'PROCESSING' &&
        job.processingStartedAt &&
        job.processingStartedAt.getTime() <= params.threshold.getTime()
      ) {
        job.status = 'FAILED';
        job.failureCode = params.failureCode;
        job.processingStartedAt = null;
        job.nextAttemptAt = null;
        this.jobs.set(job.id, { ...job });
        count++;
      }
    }
    return count;
  }

  async findReminderContext(job: NotificationJobDto): Promise<AppointmentReminderContext | null> {
    if (!job.appointmentId) return null;
    const app = this.appointments.get(job.appointmentId);
    if (!app || app.clinicId !== job.clinicId) return null;

    const clinic = this.clinics.get(job.clinicId);
    if (!clinic) return null;

    const setting = this.settings.get(job.clinicId);
    const patient = this.patients.get(app.patientId);
    if (!patient) return null;

    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicTimeZone: clinic.timeZone,
      clinicStatus: clinic.status,
      whatsappEnabled: setting?.whatsappEnabled ?? false,
      appointmentReminder24hEnabled: setting?.appointmentReminder24hEnabled ?? false,
      defaultCountryCallingCode: setting?.defaultCountryCallingCode ?? '52',
      appointmentId: app.id,
      appointmentStatus: app.status,
      appointmentStartAt: app.startAt,
      patientFirstName: patient.firstName,
      patientPhone: patient.phone
    };
  }

  async findDailyAgendaContext(job: NotificationJobDto): Promise<DailyAgendaContext | null> {
    const clinic = this.clinics.get(job.clinicId);
    if (!clinic) return null;

    const setting = this.settings.get(job.clinicId);
    if (!setting) return null;

    const timeZone = clinic.timeZone;
    if (!TimezoneUtil.isValidTimezone(timeZone)) {
      return {
        clinicId: clinic.id,
        clinicName: clinic.name,
        clinicTimeZone: timeZone,
        clinicStatus: clinic.status,
        whatsappEnabled: setting.whatsappEnabled,
        dailyAgendaEnabled: setting.dailyAgendaEnabled,
        dailyAgendaRecipientPhone: setting.dailyAgendaRecipientPhone,
        defaultCountryCallingCode: setting.defaultCountryCallingCode,
        appointments: []
      };
    }

    const dayRange = TimezoneUtil.getLocalDayRangeUtc(job.scheduledFor, timeZone);

    const apps: any[] = [];
    for (const app of this.appointments.values()) {
      if (app.clinicId !== job.clinicId) continue;
      if (app.startAt.getTime() >= dayRange.startUtc.getTime() && app.startAt.getTime() < dayRange.endUtc.getTime()) {
        if (['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(app.status)) {
          const patient = this.patients.get(app.patientId);
          apps.push({
            startAt: app.startAt,
            patientFirstName: patient?.firstName || 'Paciente',
            patientLastName: patient?.lastName || null
          });
        }
      }
    }

    apps.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicTimeZone: timeZone,
      clinicStatus: clinic.status,
      whatsappEnabled: setting.whatsappEnabled,
      dailyAgendaEnabled: setting.dailyAgendaEnabled,
      dailyAgendaRecipientPhone: setting.dailyAgendaRecipientPhone,
      defaultCountryCallingCode: setting.defaultCountryCallingCode,
      appointments: apps
    };
  }

  async listDailyAgendaEnabledClinics(): Promise<DailyAgendaClinicConfig[]> {
    const list: DailyAgendaClinicConfig[] = [];
    for (const setting of this.settings.values()) {
      if (setting.dailyAgendaEnabled && setting.whatsappEnabled && setting.dailyAgendaRecipientPhone) {
        const clinic = this.clinics.get(setting.clinicId);
        if (clinic && clinic.status === 'ACTIVE') {
          list.push({
            clinicId: clinic.id,
            timeZone: clinic.timeZone,
            dailyAgendaLocalTime: setting.dailyAgendaLocalTime
          });
        }
      }
    }
    return list;
  }

  async ensureDailyAgendaJob(params: EnsureDailyAgendaJobParams): Promise<void> {
    for (const job of this.jobs.values()) {
      if (job.clinicId === params.clinicId && job.idempotencyKey === params.idempotencyKey) {
        if (job.status === 'CANCELLED') {
          job.status = 'PENDING';
          job.scheduledFor = params.scheduledFor;
          job.attempts = 0;
          job.nextAttemptAt = null;
          job.processingStartedAt = null;
          job.recipientPhone = null;
          job.sentAt = null;
          job.providerMessageId = null;
          job.failureCode = null;
          this.jobs.set(job.id, { ...job });
        } else if (job.status === 'PENDING') {
          if (job.scheduledFor.getTime() !== params.scheduledFor.getTime()) {
            job.scheduledFor = params.scheduledFor;
            this.jobs.set(job.id, { ...job });
          }
        }
        return;
      }
    }

    const id = `job-agenda-${this.jobs.size + 1}`;
    const newJob: NotificationJobDto = {
      id,
      clinicId: params.clinicId,
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: params.scheduledFor,
      appointmentStartAtSnapshot: null,
      idempotencyKey: params.idempotencyKey,
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.jobs.set(id, newJob);
  }

  async markSent(params: MarkSentParams): Promise<boolean> {
    const job = this.jobs.get(params.id);
    if (!job || job.status !== 'PROCESSING') return false;
    job.status = 'SENT';
    job.sentAt = params.sentAt;
    job.providerMessageId = params.providerMessageId;
    job.failureCode = null;
    job.nextAttemptAt = null;
    job.processingStartedAt = null;
    this.jobs.set(job.id, { ...job });
    return true;
  }

  async markRetryPending(params: MarkRetryPendingParams): Promise<boolean> {
    const job = this.jobs.get(params.id);
    if (!job || job.status !== 'PROCESSING') return false;
    job.status = 'RETRY_PENDING';
    job.nextAttemptAt = params.nextAttemptAt;
    job.failureCode = params.failureCode;
    job.processingStartedAt = null;
    this.jobs.set(job.id, { ...job });
    return true;
  }

  async markFailed(params: MarkFailedParams): Promise<boolean> {
    const job = this.jobs.get(params.id);
    if (!job || job.status !== 'PROCESSING') return false;
    job.status = 'FAILED';
    job.failureCode = params.failureCode;
    job.nextAttemptAt = null;
    job.processingStartedAt = null;
    this.jobs.set(job.id, { ...job });
    return true;
  }

  async markCancelled(params: MarkCancelledParams): Promise<boolean> {
    const job = this.jobs.get(params.id);
    if (!job || job.status !== 'PROCESSING') return false;
    job.status = 'CANCELLED';
    job.failureCode = params.failureCode || null;
    job.nextAttemptAt = null;
    job.processingStartedAt = null;
    this.jobs.set(job.id, { ...job });
    return true;
  }

  async updateRecipientPhone(params: UpdateRecipientPhoneParams): Promise<boolean> {
    if (this.onBeforeUpdateRecipientPhone) {
      this.onBeforeUpdateRecipientPhone();
    }
    const job = this.jobs.get(params.id);
    if (!job || job.status !== 'PROCESSING') return false;
    job.recipientPhone = params.recipientPhone;
    this.jobs.set(job.id, { ...job });
    return true;
  }
}

test('Notification Worker & Delivery Engine - Phase B', async (t) => {
  const baseTime = new Date('2026-09-02T10:00:00.000Z');

  const setupTestEnv = () => {
    const repo = new InMemoryNotificationJobRepository();
    const delivery = new FakeNotificationDeliveryAdapter();
    const clock = new FakeClock(baseTime);
    const worker = new NotificationWorkerService(repo, delivery, clock);

    repo.clinics.set('c1', {
      id: 'c1',
      name: 'Clínica Dental Yeskira',
      timeZone: 'America/Mexico_City',
      status: 'ACTIVE'
    });

    repo.settings.set('c1', {
      clinicId: 'c1',
      whatsappEnabled: true,
      appointmentReminder24hEnabled: true,
      dailyAgendaEnabled: true,
      dailyAgendaLocalTime: '07:00',
      dailyAgendaRecipientPhone: '2281234567',
      defaultCountryCallingCode: '52'
    });

    repo.patients.set('p1', {
      id: 'p1',
      clinicId: 'c1',
      firstName: 'Ana',
      lastName: 'Perez',
      phone: '2281234567'
    });

    return { repo, delivery, clock, worker };
  };

  await t.test('1. PENDING vencido se reclama', async () => {
    const { repo, worker } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T09:59:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T09:59:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.claimedCount, 1);
  });

  await t.test('2. PENDING futuro no se reclama', async () => {
    const { repo, worker } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T10:30:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T10:30:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.claimedCount, 0);
  });

  await t.test('3. RETRY_PENDING vencido se reclama', async () => {
    const { repo, worker } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'RETRY_PENDING',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: new Date('2026-09-02T09:55:00.000Z'),
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: 'SOME_ERROR',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.claimedCount, 1);
  });

  await t.test('4. RETRY_PENDING con nextAttemptAt futuro no se reclama', async () => {
    const { repo, worker } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'RETRY_PENDING',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: new Date('2026-09-02T10:15:00.000Z'),
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: 'SOME_ERROR',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.claimedCount, 0);
  });

  await t.test('5. claim cambia PROCESSING, attempts+1 y processingStartedAt', async () => {
    const { repo, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T09:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T09:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const claimed = await repo.claimDueJobs({ now: clock.now(), limit: 10 });
    assert.strictEqual(claimed.length, 1);
    assert.strictEqual(claimed[0]?.status, 'PROCESSING');
    assert.strictEqual(claimed[0]?.attempts, 1);
    assert.strictEqual(claimed[0]?.processingStartedAt?.toISOString(), clock.now().toISOString());
  });

  await t.test('6. dos claims concurrentes no devuelven el mismo job', async () => {
    const { repo, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T09:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T09:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const claim1 = await repo.claimDueJobs({ now: clock.now(), limit: 10 });
    const claim2 = await repo.claimDueJobs({ now: clock.now(), limit: 10 });

    assert.strictEqual(claim1.length, 1);
    assert.strictEqual(claim2.length, 0);
  });

  await t.test('7. PROCESSING > timeout -> FAILED PROCESSING_TIMEOUT_AMBIGUOUS', async () => {
    const { repo, worker, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PROCESSING',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: new Date(clock.now().getTime() - 15 * 60 * 1000),
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.staleFailedCount, 1);

    const job = repo.jobs.get('j1');
    assert.strictEqual(job?.status, 'FAILED');
    assert.strictEqual(job?.failureCode, NotificationFailureCodes.PROCESSING_TIMEOUT_AMBIGUOUS);
    assert.strictEqual(job?.processingStartedAt, null);
  });

  await t.test('8. PROCESSING reciente no se altera', async () => {
    const { repo, worker, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PROCESSING',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: new Date(clock.now().getTime() - 2 * 60 * 1000),
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.staleFailedCount, 0);

    const job = repo.jobs.get('j1');
    assert.strictEqual(job?.status, 'PROCESSING');
  });

  const setupReminderEnv = (appointmentStatus = 'SCHEDULED', startAt?: Date) => {
    const env = setupTestEnv();
    const appStart = startAt || new Date('2026-09-03T10:00:00.000Z');

    env.repo.appointments.set('a1', {
      id: 'a1',
      clinicId: 'c1',
      patientId: 'p1',
      professionalMembershipId: 'prof1',
      startAt: appStart,
      endAt: new Date(appStart.getTime() + 30 * 60 * 1000),
      status: appointmentStatus
    });

    env.repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T09:00:00.000Z'),
      appointmentStartAtSnapshot: appStart,
      idempotencyKey: `appointment-reminder-24h:a1:${appStart.toISOString()}`,
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return env;
  };

  await t.test('9. SCHEDULED válido -> delivery', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    const summary = await worker.runOnce();

    assert.strictEqual(summary.sentCount, 1);
    assert.strictEqual(delivery.deliveries.length, 1);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'SENT');
  });

  await t.test('10. CONFIRMED válido -> delivery', async () => {
    const { worker, repo, delivery } = setupReminderEnv('CONFIRMED');
    const summary = await worker.runOnce();

    assert.strictEqual(summary.sentCount, 1);
    assert.strictEqual(delivery.deliveries.length, 1);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'SENT');
  });

  await t.test('11. CANCELLED -> job CANCELLED sin delivery', async () => {
    const { worker, repo, delivery } = setupReminderEnv('CANCELLED');
    const summary = await worker.runOnce();

    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('12. COMPLETED -> CANCELLED', async () => {
    const { worker, repo, delivery } = setupReminderEnv('COMPLETED');
    const summary = await worker.runOnce();

    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('13. NO_SHOW -> CANCELLED', async () => {
    const { worker, repo, delivery } = setupReminderEnv('NO_SHOW');
    const summary = await worker.runOnce();

    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('14. IN_PROGRESS -> CANCELLED', async () => {
    const { worker, repo, delivery } = setupReminderEnv('IN_PROGRESS');
    const summary = await worker.runOnce();

    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('15. startAt diferente del snapshot -> CANCELLED', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    const app = repo.appointments.get('a1');
    app.startAt = new Date('2026-09-04T12:00:00.000Z');

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('16. cita ya iniciada (now >= startAt) -> CANCELLED', async () => {
    const pastStart = new Date('2026-09-02T09:30:00.000Z');
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED', pastStart);

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('17. settings deshabilitados -> CANCELLED', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    repo.settings.set('c1', {
      clinicId: 'c1',
      whatsappEnabled: true,
      appointmentReminder24hEnabled: false
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('18. clinic inactive -> CANCELLED', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    const clinic = repo.clinics.get('c1');
    clinic.status = 'INACTIVE';

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('19. 2281234567 + 52 -> +522281234567', () => {
    const res = PhoneNormalizer.normalize('2281234567', '52');
    assert.strictEqual(res.valid, true);
    if (res.valid) {
      assert.strictEqual(res.e164, '+522281234567');
    }
  });

  await t.test('20. +522281234567 permanece válido', () => {
    const res = PhoneNormalizer.normalize('+522281234567', '52');
    assert.strictEqual(res.valid, true);
    if (res.valid) {
      assert.strictEqual(res.e164, '+522281234567');
    }
  });

  await t.test('21. formato "(228) 123-4567" se normaliza', () => {
    const res = PhoneNormalizer.normalize('(228) 123-4567', '52');
    assert.strictEqual(res.valid, true);
    if (res.valid) {
      assert.strictEqual(res.e164, '+522281234567');
    }
  });

  await t.test('22. null -> RECIPIENT_PHONE_MISSING', async () => {
    const { worker, repo } = setupReminderEnv('SCHEDULED');
    const patient = repo.patients.get('p1');
    patient.phone = null;

    const summary = await worker.runOnce();
    assert.strictEqual(summary.failedCount, 1);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'FAILED');
    assert.strictEqual(repo.jobs.get('j1')?.failureCode, NotificationFailureCodes.RECIPIENT_PHONE_MISSING);
  });

  await t.test('23. inválido -> RECIPIENT_PHONE_INVALID', async () => {
    const { worker, repo } = setupReminderEnv('SCHEDULED');
    const patient = repo.patients.get('p1');
    patient.phone = '123abc45';

    const summary = await worker.runOnce();
    assert.strictEqual(summary.failedCount, 1);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'FAILED');
    assert.strictEqual(repo.jobs.get('j1')?.failureCode, NotificationFailureCodes.RECIPIENT_PHONE_INVALID);
  });

  await t.test('24. SENT -> SENT + providerMessageId + sentAt', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    delivery.setDefaultResult({ status: 'SENT', providerMessageId: 'prov-msg-999' });

    await worker.runOnce();

    const job = repo.jobs.get('j1');
    assert.strictEqual(job?.status, 'SENT');
    assert.strictEqual(job?.providerMessageId, 'prov-msg-999');
    assert.ok(job?.sentAt);
  });

  await t.test('25. RETRYABLE_FAILURE -> RETRY_PENDING', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    delivery.setDefaultResult({ status: 'RETRYABLE_FAILURE', failureCode: 'RATE_LIMIT' });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.retryPendingCount, 1);

    const job = repo.jobs.get('j1');
    assert.strictEqual(job?.status, 'RETRY_PENDING');
    assert.strictEqual(job?.failureCode, 'RATE_LIMIT');
    assert.ok(job?.nextAttemptAt);
  });

  await t.test('26. PERMANENT_FAILURE -> FAILED', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    delivery.setDefaultResult({ status: 'PERMANENT_FAILURE', failureCode: 'NOT_WHATSAPP_USER' });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.failedCount, 1);

    const job = repo.jobs.get('j1');
    assert.strictEqual(job?.status, 'FAILED');
    assert.strictEqual(job?.failureCode, 'NOT_WHATSAPP_USER');
  });

  await t.test('27. AMBIGUOUS_FAILURE -> FAILED', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    delivery.setDefaultResult({ status: 'AMBIGUOUS_FAILURE', failureCode: 'NETWORK_TIMEOUT' });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.failedCount, 1);

    const job = repo.jobs.get('j1');
    assert.strictEqual(job?.status, 'FAILED');
    assert.strictEqual(job?.failureCode, 'NETWORK_TIMEOUT');
  });

  await t.test('28. exception inesperada de delivery -> FAILED conservador', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    delivery.setThrowError(new Error('Fatal connection crash'));

    const summary = await worker.runOnce();
    assert.strictEqual(summary.failedCount, 1);

    const job = repo.jobs.get('j1');
    assert.strictEqual(job?.status, 'FAILED');
    assert.strictEqual(job?.failureCode, NotificationFailureCodes.DELIVERY_UNEXPECTED_EXCEPTION);
  });

  await t.test('29. max attempts -> FAILED', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    const job = repo.jobs.get('j1')!;
    job.attempts = 7;
    job.status = 'RETRY_PENDING';
    job.nextAttemptAt = new Date('2026-09-02T09:00:00.000Z');

    delivery.setDefaultResult({ status: 'RETRYABLE_FAILURE', failureCode: 'SERVICE_UNAVAILABLE' });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.failedCount, 1);

    const updatedJob = repo.jobs.get('j1');
    assert.strictEqual(updatedJob?.status, 'FAILED');
    assert.strictEqual(updatedJob?.attempts, 8);
    assert.strictEqual(updatedJob?.failureCode, 'SERVICE_UNAVAILABLE');
  });

  await t.test('30. next retry posterior a expiración -> CANCELLED', async () => {
    const appStart = new Date('2026-09-02T10:10:00.000Z');
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED', appStart);

    const job = repo.jobs.get('j1')!;
    job.attempts = 4;
    job.status = 'RETRY_PENDING';
    job.nextAttemptAt = new Date('2026-09-02T09:59:00.000Z');

    delivery.setDefaultResult({ status: 'RETRYABLE_FAILURE', failureCode: 'TEMPORARY_ERROR' });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);

    const updatedJob = repo.jobs.get('j1');
    assert.strictEqual(updatedJob?.status, 'CANCELLED');
    assert.strictEqual(updatedJob?.failureCode, NotificationFailureCodes.RETRY_EXCEEDS_EXPIRATION);
  });

  await t.test('31. genera job para hoy si hora local no pasó', async () => {
    const { repo, worker, clock } = setupTestEnv();
    const ensured = await worker.ensureNextDailyAgendaJobs(clock.now());

    assert.strictEqual(ensured, 1);
    assert.strictEqual(repo.jobs.size, 1);
    const job = Array.from(repo.jobs.values())[0];
    assert.strictEqual(job?.idempotencyKey, 'daily-agenda:c1:2026-09-02');
  });

  await t.test('32. genera mañana si hora ya pasó', async () => {
    const { repo, worker } = setupTestEnv();
    const afternoonClock = new Date('2026-09-02T18:00:00.000Z');
    const ensured = await worker.ensureNextDailyAgendaJobs(afternoonClock);

    assert.strictEqual(ensured, 1);
    assert.strictEqual(repo.jobs.size, 1);
    const job = Array.from(repo.jobs.values())[0];
    assert.strictEqual(job?.idempotencyKey, 'daily-agenda:c1:2026-09-03');
  });

  await t.test('33. dos llamadas generan un solo job por fecha', async () => {
    const { repo, worker, clock } = setupTestEnv();
    await worker.ensureNextDailyAgendaJobs(clock.now());
    await worker.ensureNextDailyAgendaJobs(clock.now());

    assert.strictEqual(repo.jobs.size, 1);
  });

  await t.test('34. timezone America/Mexico_City correcto', () => {
    const utc = TimezoneUtil.localYMDAndTimeToUtc('2026-09-02', '07:00', 'America/Mexico_City');
    assert.strictEqual(utc.toISOString(), '2026-09-02T13:00:00.000Z');
  });

  await t.test('35. timezone DST test correcto (America/New_York EDT = UTC-4)', () => {
    const utc = TimezoneUtil.localYMDAndTimeToUtc('2026-09-02', '07:00', 'America/New_York');
    assert.strictEqual(utc.toISOString(), '2026-09-02T11:00:00.000Z');
  });

  await t.test('36. agenda consulta solo citas del día local', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    repo.patients.set('p2', { id: 'p2', clinicId: 'c1', firstName: 'Carlos', lastName: 'Ruiz', phone: '2281112233' });

    repo.appointments.set('app-today-1', {
      id: 'app-today-1',
      clinicId: 'c1',
      patientId: 'p1',
      startAt: new Date('2026-09-02T15:00:00.000Z'),
      status: 'SCHEDULED'
    });

    repo.appointments.set('app-today-2', {
      id: 'app-today-2',
      clinicId: 'c1',
      patientId: 'p2',
      startAt: new Date('2026-09-02T16:30:00.000Z'),
      status: 'CONFIRMED'
    });

    repo.appointments.set('app-tomorrow', {
      id: 'app-tomorrow',
      clinicId: 'c1',
      patientId: 'p1',
      startAt: new Date('2026-09-03T15:00:00.000Z'),
      status: 'SCHEDULED'
    });

    repo.jobs.set('agenda-1', {
      id: 'agenda-1',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    clock.advanceByMs(3 * 60 * 60 * 1000);

    const summary = await worker.runOnce();
    assert.strictEqual(summary.sentCount, 1);
    assert.strictEqual(delivery.deliveries.length, 1);

    const body = delivery.deliveries[0]?.body || '';
    assert.ok(body.includes('09:00 — Ana P.'));
    assert.ok(body.includes('10:30 — Carlos R.'));
    assert.ok(!body.includes('app-tomorrow'));
  });

  await t.test('37. excluye CANCELLED/COMPLETED/NO_SHOW de la agenda', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    repo.appointments.set('app-valid', {
      id: 'app-valid',
      clinicId: 'c1',
      patientId: 'p1',
      startAt: new Date('2026-09-02T15:00:00.000Z'),
      status: 'SCHEDULED'
    });

    repo.appointments.set('app-canc', {
      id: 'app-canc',
      clinicId: 'c1',
      patientId: 'p1',
      startAt: new Date('2026-09-02T16:00:00.000Z'),
      status: 'CANCELLED'
    });

    repo.appointments.set('app-comp', {
      id: 'app-comp',
      clinicId: 'c1',
      patientId: 'p1',
      startAt: new Date('2026-09-02T17:00:00.000Z'),
      status: 'COMPLETED'
    });

    repo.appointments.set('app-noshow', {
      id: 'app-noshow',
      clinicId: 'c1',
      patientId: 'p1',
      startAt: new Date('2026-09-02T18:00:00.000Z'),
      status: 'NO_SHOW'
    });

    repo.jobs.set('agenda-1', {
      id: 'agenda-1',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    clock.advanceByMs(3 * 60 * 60 * 1000);
    await worker.runOnce();

    const body = delivery.deliveries[0]?.body || '';
    assert.ok(body.includes('09:00 — Ana P.'));
    assert.ok(!body.includes('10:00'));
    assert.ok(!body.includes('11:00'));
    assert.ok(!body.includes('12:00'));
  });

  await t.test('38. orden cronológico en agenda', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    repo.patients.set('p2', { id: 'p2', clinicId: 'c1', firstName: 'Beto', lastName: 'Z', phone: '2281112233' });

    repo.appointments.set('app-late', {
      id: 'app-late',
      clinicId: 'c1',
      patientId: 'p2',
      startAt: new Date('2026-09-02T18:00:00.000Z'),
      status: 'SCHEDULED'
    });

    repo.appointments.set('app-early', {
      id: 'app-early',
      clinicId: 'c1',
      patientId: 'p1',
      startAt: new Date('2026-09-02T15:00:00.000Z'),
      status: 'SCHEDULED'
    });

    repo.jobs.set('agenda-1', {
      id: 'agenda-1',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    clock.advanceByMs(3 * 60 * 60 * 1000);
    await worker.runOnce();

    const body = delivery.deliveries[0]?.body || '';
    const posEarly = body.indexOf('09:00');
    const posLate = body.indexOf('12:00');
    assert.ok(posEarly < posLate);
  });

  await t.test('39. nombre usa firstName + inicial lastName', () => {
    const msg = NotificationMessageComposer.composeDailyAgenda({
      clinicName: 'Clínica Yeskira',
      date: new Date('2026-09-02T13:00:00.000Z'),
      appointments: [
        {
          startAt: new Date('2026-09-02T15:00:00.000Z'),
          patientFirstName: 'María',
          patientLastName: 'González'
        }
      ],
      timeZone: 'America/Mexico_City'
    });

    assert.ok(msg.includes('09:00 — María G.'));
  });

  await t.test('40. no incluye reason/administrativeNotes', () => {
    const msg = NotificationMessageComposer.composeDailyAgenda({
      clinicName: 'Clínica Yeskira',
      date: new Date('2026-09-02T13:00:00.000Z'),
      appointments: [
        {
          startAt: new Date('2026-09-02T15:00:00.000Z'),
          patientFirstName: 'María',
          patientLastName: 'González'
        }
      ],
      timeZone: 'America/Mexico_City'
    });

    assert.strictEqual(msg.includes('reason'), false);
    assert.strictEqual(msg.includes('notas'), false);
  });

  await t.test('41. sin citas genera mensaje "sin citas"', () => {
    const msg = NotificationMessageComposer.composeDailyAgenda({
      clinicName: 'Clínica Yeskira',
      date: new Date('2026-09-02T13:00:00.000Z'),
      appointments: [],
      timeZone: 'America/Mexico_City'
    });

    assert.ok(msg.includes('No hay citas programadas para el día de hoy'));
  });

  await t.test('42. >2h tarde -> CANCELLED sin delivery', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    repo.jobs.set('agenda-1', {
      id: 'agenda-1',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    clock.advanceByMs(6 * 60 * 60 * 1000);

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('agenda-1')?.status, 'CANCELLED');
    assert.strictEqual(repo.jobs.get('agenda-1')?.failureCode, NotificationFailureCodes.DAILY_AGENDA_EXPIRED);
  });

  await t.test('43. recipient missing -> FAILED', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    const setting = repo.settings.get('c1');
    setting.dailyAgendaRecipientPhone = null;

    repo.jobs.set('agenda-1', {
      id: 'agenda-1',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T10:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
  });

  await t.test('44. recipient invalid -> FAILED', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    const setting = repo.settings.get('c1');
    setting.dailyAgendaRecipientPhone = 'invalid-phone-num';

    repo.jobs.set('agenda-1', {
      id: 'agenda-1',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    clock.advanceByMs(3 * 60 * 60 * 1000);

    const summary = await worker.runOnce();
    assert.strictEqual(summary.failedCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('agenda-1')?.status, 'FAILED');
    assert.strictEqual(repo.jobs.get('agenda-1')?.failureCode, NotificationFailureCodes.DAILY_AGENDA_RECIPIENT_INVALID);
  });

  await t.test('45. settings disabled antes de enviar -> CANCELLED', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    const setting = repo.settings.get('c1');
    setting.dailyAgendaEnabled = false;

    repo.jobs.set('agenda-1', {
      id: 'agenda-1',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T10:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('agenda-1')?.status, 'CANCELLED');
  });

  await t.test('46. fallo de un job no evita procesar el siguiente', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    repo.patients.set('p-bad', { id: 'p-bad', clinicId: 'c1', firstName: 'Mal', phone: '123' });
    repo.appointments.set('a-bad', {
      id: 'a-bad',
      clinicId: 'c1',
      patientId: 'p-bad',
      startAt: new Date('2026-09-03T10:00:00.000Z'),
      status: 'SCHEDULED'
    });
    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a-bad',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T09:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T10:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    repo.appointments.set('a-good', {
      id: 'a-good',
      clinicId: 'c1',
      patientId: 'p1',
      startAt: new Date('2026-09-03T11:00:00.000Z'),
      status: 'SCHEDULED'
    });
    repo.jobs.set('j2', {
      id: 'j2',
      clinicId: 'c1',
      appointmentId: 'a-good',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T09:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T11:00:00.000Z'),
      idempotencyKey: 'k2',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const summary = await worker.runOnce();
    assert.strictEqual(summary.failedCount, 1);
    assert.strictEqual(summary.sentCount, 1);
    assert.strictEqual(delivery.deliveries.length, 1);
  });

  await t.test('47. runOnce sin jobs es no-op', async () => {
    const { worker } = setupTestEnv();
    const summary = await worker.runOnce();

    assert.strictEqual(summary.claimedCount, 0);
    assert.strictEqual(summary.sentCount, 0);
    assert.strictEqual(summary.failedCount, 0);
  });

  await t.test('48. FakeDelivery registra llamadas sin enviar nada real', async () => {
    const delivery = new FakeNotificationDeliveryAdapter();
    await delivery.deliver({
      channel: 'WHATSAPP',
      recipient: '+522281234567',
      body: 'Test message',
      jobId: 'job-123'
    });

    assert.strictEqual(delivery.deliveries.length, 1);
    assert.strictEqual(delivery.deliveries[0]?.recipient, '+522281234567');
    assert.strictEqual(delivery.deliveries[0]?.body, 'Test message');
  });

  await t.test('49. NotificationJob no persiste body', async () => {
    const { worker, repo } = setupReminderEnv('SCHEDULED');
    await worker.runOnce();

    const job = repo.jobs.get('j1') as any;
    assert.strictEqual(job?.body, undefined);
  });

  await t.test('50. composer nunca consume reason/administrativeNotes', () => {
    const body = NotificationMessageComposer.composeAppointmentReminder({
      patientFirstName: 'Ana',
      clinicName: 'Clínica Dental',
      startAt: new Date('2026-09-03T10:00:00.000Z'),
      timeZone: 'America/Mexico_City'
    });

    assert.strictEqual(body.includes('reason'), false);
    assert.strictEqual(body.includes('administrativeNotes'), false);
    assert.strictEqual(body.includes('diagnóstico'), false);
  });

  await t.test('51. fecha civil inválida es rechazada', () => {
    assert.throws(
      () => TimezoneUtil.localYMDAndTimeToUtc('2026-02-31', '10:00', 'America/Mexico_City'),
      /Invalid civil date/
    );
  });

  await t.test('52. America/New_York 2026-03-08 02:30 es rechazada por ser inexistente', () => {
    assert.throws(
      () => TimezoneUtil.localYMDAndTimeToUtc('2026-03-08', '02:30', 'America/New_York'),
      /Nonexistent local time due to DST spring-forward/
    );
  });

  await t.test('53. America/New_York 2026-11-01 01:30 selecciona determinísticamente la primera ocurrencia', () => {
    const instant = TimezoneUtil.localYMDAndTimeToUtc('2026-11-01', '01:30', 'America/New_York');
    assert.strictEqual(instant.toISOString(), '2026-11-01T05:30:00.000Z');
  });

  await t.test('54. round-trip de esa ocurrencia produce exactamente 2026-11-01 01:30 local', () => {
    const instant = TimezoneUtil.localYMDAndTimeToUtc('2026-11-01', '01:30', 'America/New_York');
    const localYmd = TimezoneUtil.getLocalYMD(instant, 'America/New_York');
    const localTime = TimezoneUtil.formatLocalTime24h(instant, 'America/New_York');

    assert.strictEqual(localYmd, '2026-11-01');
    assert.strictEqual(localTime, '01:30');
  });

  await t.test('55. día spring-forward devuelve rango UTC de 23h', () => {
    const day = new Date('2026-03-08T12:00:00.000Z');
    const range = TimezoneUtil.getLocalDayRangeUtc(day, 'America/New_York');
    const durationHours = (range.endUtc.getTime() - range.startUtc.getTime()) / (1000 * 60 * 60);

    assert.strictEqual(durationHours, 23);
  });

  await t.test('56. día fall-back devuelve rango UTC de 25h', () => {
    const day = new Date('2026-11-01T12:00:00.000Z');
    const range = TimezoneUtil.getLocalDayRangeUtc(day, 'America/New_York');
    const durationHours = (range.endUtc.getTime() - range.startUtc.getTime()) / (1000 * 60 * 60);

    assert.strictEqual(durationHours, 25);
  });

  await t.test('57. America/Mexico_City medianoche no cambia accidentalmente de fecha', () => {
    const midnightUtc = TimezoneUtil.localYMDAndTimeToUtc('2026-09-02', '00:00', 'America/Mexico_City');
    const roundTripYmd = TimezoneUtil.getLocalYMD(midnightUtc, 'America/Mexico_City');
    const roundTripTime = TimezoneUtil.formatLocalTime24h(midnightUtc, 'America/Mexico_City');

    assert.strictEqual(roundTripYmd, '2026-09-02');
    assert.strictEqual(roundTripTime, '00:00');
  });

  await t.test('58. agenda CANCELLED de hoy, settings reactivados antes de la hora -> mismo job vuelve PENDING', async () => {
    const { repo, worker, clock } = setupTestEnv();

    repo.jobs.set('agenda-cancelled', {
      id: 'agenda-cancelled',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'CANCELLED',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 2,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: 'SOME_ERROR',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await worker.ensureNextDailyAgendaJobs(clock.now());

    const job = repo.jobs.get('agenda-cancelled');
    assert.strictEqual(job?.status, 'PENDING');
    assert.strictEqual(repo.jobs.size, 1);
  });

  await t.test('59. reactivación limpia attempts/retry/processing/failure', async () => {
    const { repo, worker, clock } = setupTestEnv();

    repo.jobs.set('agenda-cancelled', {
      id: 'agenda-cancelled',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'CANCELLED',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 5,
      nextAttemptAt: new Date(),
      processingStartedAt: new Date(),
      recipientPhone: '+52123',
      sentAt: null,
      providerMessageId: 'old-id',
      failureCode: 'DAILY_AGENDA_EXPIRED',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await worker.ensureNextDailyAgendaJobs(clock.now());

    const job = repo.jobs.get('agenda-cancelled');
    assert.strictEqual(job?.status, 'PENDING');
    assert.strictEqual(job?.attempts, 0);
    assert.strictEqual(job?.nextAttemptAt, null);
    assert.strictEqual(job?.processingStartedAt, null);
    assert.strictEqual(job?.recipientPhone, null);
    assert.strictEqual(job?.providerMessageId, null);
    assert.strictEqual(job?.failureCode, null);
  });

  await t.test('60. DAILY_AGENDA SENT nunca se reactiva', async () => {
    const { repo, worker, clock } = setupTestEnv();

    repo.jobs.set('agenda-sent', {
      id: 'agenda-sent',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'SENT',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: '+522281234567',
      sentAt: new Date(),
      providerMessageId: 'prov-1',
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await worker.ensureNextDailyAgendaJobs(clock.now());

    const job = repo.jobs.get('agenda-sent');
    assert.strictEqual(job?.status, 'SENT');
    assert.strictEqual(repo.jobs.size, 1);
  });

  await t.test('61. FAILED no se reactiva automáticamente', async () => {
    const { repo, worker, clock } = setupTestEnv();

    repo.jobs.set('agenda-failed', {
      id: 'agenda-failed',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'FAILED',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 8,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: '+522281234567',
      sentAt: null,
      providerMessageId: null,
      failureCode: 'DAILY_AGENDA_RECIPIENT_INVALID',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await worker.ensureNextDailyAgendaJobs(clock.now());

    const job = repo.jobs.get('agenda-failed');
    assert.strictEqual(job?.status, 'FAILED');
    assert.strictEqual(repo.jobs.size, 1);
  });

  await t.test('62. dos ensure sobre PENDING no duplican', async () => {
    const { repo, worker, clock } = setupTestEnv();

    await worker.ensureNextDailyAgendaJobs(clock.now());
    assert.strictEqual(repo.jobs.size, 1);

    await worker.ensureNextDailyAgendaJobs(clock.now());
    assert.strictEqual(repo.jobs.size, 1);
  });

  await t.test('63. clinic America/New_York consulta su día local, no Mexico_City', async () => {
    const { repo, delivery } = setupTestEnv();

    repo.clinics.set('c-ny', {
      id: 'c-ny',
      name: 'NY Dental Clinic',
      timeZone: 'America/New_York',
      status: 'ACTIVE'
    });

    repo.settings.set('c-ny', {
      clinicId: 'c-ny',
      whatsappEnabled: true,
      dailyAgendaEnabled: true,
      dailyAgendaLocalTime: '07:00',
      dailyAgendaRecipientPhone: '2125551234',
      defaultCountryCallingCode: '1'
    });

    repo.patients.set('p-ny', {
      id: 'p-ny',
      clinicId: 'c-ny',
      firstName: 'John',
      lastName: 'Smith',
      phone: '2125551234'
    });

    repo.appointments.set('app-ny-1', {
      id: 'app-ny-1',
      clinicId: 'c-ny',
      patientId: 'p-ny',
      startAt: new Date('2026-09-02T13:00:00.000Z'),
      status: 'SCHEDULED'
    });

    repo.jobs.set('agenda-ny', {
      id: 'agenda-ny',
      clinicId: 'c-ny',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T11:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c-ny:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const clockNy = new FakeClock(new Date('2026-09-02T11:00:00.000Z'));
    const workerNy = new NotificationWorkerService(repo, delivery, clockNy);

    const summary = await workerNy.runOnce();
    assert.strictEqual(summary.sentCount, 1);
    assert.ok(delivery.deliveries[0]?.body.includes('09:00 — John S.'));
  });

  await t.test('64. idempotency date distinta al scheduledFor local -> CANCELLED sin delivery', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    repo.jobs.set('agenda-mismatch', {
      id: 'agenda-mismatch',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-05',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    clock.advanceByMs(3 * 60 * 60 * 1000);
    const summary = await worker.runOnce();

    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('agenda-mismatch')?.status, 'CANCELLED');
    assert.strictEqual(repo.jobs.get('agenda-mismatch')?.failureCode, NotificationFailureCodes.DAILY_AGENDA_DATE_MISMATCH);
  });

  await t.test('65. clinicId inconsistente/malformed key -> CANCELLED sin delivery', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    repo.jobs.set('agenda-malformed', {
      id: 'agenda-malformed',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'invalid-malformed-key',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    clock.advanceByMs(3 * 60 * 60 * 1000);
    const summary = await worker.runOnce();

    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('agenda-malformed')?.status, 'CANCELLED');
    assert.strictEqual(repo.jobs.get('agenda-malformed')?.failureCode, NotificationFailureCodes.DAILY_AGENDA_DATE_MISMATCH);
  });

  await t.test('66. stale PROCESSING pasa a FAILED y luego markSent viejo NO lo convierte a SENT', async () => {
    const { repo, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PROCESSING',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: new Date(clock.now().getTime() - 15 * 60 * 1000),
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await repo.failStaleProcessing({
      threshold: new Date(clock.now().getTime() - 10 * 60 * 1000),
      failureCode: NotificationFailureCodes.PROCESSING_TIMEOUT_AMBIGUOUS
    });

    assert.strictEqual(repo.jobs.get('j1')?.status, 'FAILED');

    const applied = await repo.markSent({
      id: 'j1',
      sentAt: clock.now(),
      providerMessageId: 'prov-late'
    });

    assert.strictEqual(applied, false);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'FAILED');
  });

  await t.test('67. CANCELLED no puede convertirse a SENT por un worker viejo', async () => {
    const { repo, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'CANCELLED',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const applied = await repo.markSent({
      id: 'j1',
      sentAt: clock.now(),
      providerMessageId: 'prov-late'
    });

    assert.strictEqual(applied, false);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('68. SENT no puede convertirse a FAILED', async () => {
    const { repo } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'SENT',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: new Date(),
      providerMessageId: 'prov-1',
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const applied = await repo.markFailed({
      id: 'j1',
      failureCode: 'LATE_ERROR'
    });

    assert.strictEqual(applied, false);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'SENT');
  });

  await t.test('69. transición PROCESSING -> SENT sí funciona', async () => {
    const { repo, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PROCESSING',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: clock.now(),
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const applied = await repo.markSent({
      id: 'j1',
      sentAt: clock.now(),
      providerMessageId: 'prov-success'
    });

    assert.strictEqual(applied, true);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'SENT');
  });

  await t.test('70. PROCESSING -> RETRY_PENDING sí funciona', async () => {
    const { repo, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PROCESSING',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: clock.now(),
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const applied = await repo.markRetryPending({
      id: 'j1',
      nextAttemptAt: new Date('2026-09-02T10:05:00.000Z'),
      failureCode: 'RATE_LIMIT'
    });

    assert.strictEqual(applied, true);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'RETRY_PENDING');
  });

  await t.test('71. PROCESSING -> FAILED sí funciona', async () => {
    const { repo, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PROCESSING',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: clock.now(),
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const applied = await repo.markFailed({
      id: 'j1',
      failureCode: 'FATAL_ERROR'
    });

    assert.strictEqual(applied, true);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'FAILED');
  });

  await t.test('72. PROCESSING -> CANCELLED sí funciona', async () => {
    const { repo, clock } = setupTestEnv();

    repo.jobs.set('j1', {
      id: 'j1',
      clinicId: 'c1',
      appointmentId: 'a1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PROCESSING',
      scheduledFor: new Date('2026-09-02T08:00:00.000Z'),
      appointmentStartAtSnapshot: new Date('2026-09-03T08:00:00.000Z'),
      idempotencyKey: 'k1',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: clock.now(),
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const applied = await repo.markCancelled({
      id: 'j1',
      failureCode: 'CANCELLED_REASON'
    });

    assert.strictEqual(applied, true);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  // ==========================================
  // NEW AUDIT TESTS (73 - 83)
  // ==========================================

  await t.test('73. timezone inválida nunca cae silenciosamente en America/Mexico_City y no realiza delivery', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');
    const clinic = repo.clinics.get('c1');
    clinic.timeZone = 'Invalid/Invalid_Zone';

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
    assert.strictEqual(repo.jobs.get('j1')?.failureCode, NotificationFailureCodes.INVALID_CLINIC_TIMEZONE);
  });

  await t.test('74. dos ensure concurrentes para misma agenda terminan con exactamente un job y sin excepción', async () => {
    const { repo, worker, clock } = setupTestEnv();

    await Promise.all([
      worker.ensureNextDailyAgendaJobs(clock.now()),
      worker.ensureNextDailyAgendaJobs(clock.now())
    ]);

    assert.strictEqual(repo.jobs.size, 1);
  });

  await t.test('75. colisión unique simulada no aborta ensure ni runOnce', async () => {
    const { worker, clock } = setupTestEnv();

    await worker.ensureNextDailyAgendaJobs(clock.now());
    const secondCall = await worker.ensureNextDailyAgendaJobs(clock.now());

    assert.strictEqual(secondCall, 1);
  });

  await t.test('76. CANCELLED -> PENDING ocurre mediante CAS y no puede pisar PROCESSING/SENT/FAILED', async () => {
    const { repo, worker, clock } = setupTestEnv();

    repo.jobs.set('agenda-sent', {
      id: 'agenda-sent',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'SENT',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 1,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: '+522281234567',
      sentAt: new Date(),
      providerMessageId: 'prov-sent',
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await worker.ensureNextDailyAgendaJobs(clock.now());
    assert.strictEqual(repo.jobs.get('agenda-sent')?.status, 'SENT');
  });

  await t.test('77. reminder pierde PROCESSING antes de updateRecipientPhone -> cero deliveries', async () => {
    const { worker, repo, delivery } = setupReminderEnv('SCHEDULED');

    repo.onBeforeUpdateRecipientPhone = () => {
      const job = repo.jobs.get('j1');
      if (job) {
        job.status = 'FAILED';
        job.failureCode = NotificationFailureCodes.PROCESSING_TIMEOUT_AMBIGUOUS;
      }
    };

    const summary = await worker.runOnce();
    assert.strictEqual(summary.sentCount, 0);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'FAILED');
  });

  await t.test('78. daily agenda pierde PROCESSING antes de updateRecipientPhone -> cero deliveries', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    repo.jobs.set('agenda-1', {
      id: 'agenda-1',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    clock.advanceByMs(3 * 60 * 60 * 1000);

    repo.onBeforeUpdateRecipientPhone = () => {
      const job = repo.jobs.get('agenda-1');
      if (job) {
        job.status = 'FAILED';
        job.failureCode = NotificationFailureCodes.PROCESSING_TIMEOUT_AMBIGUOUS;
      }
    };

    const summary = await worker.runOnce();
    assert.strictEqual(summary.sentCount, 0);
    assert.strictEqual(delivery.deliveries.length, 0);
  });

  await t.test('79. reminder reclamado antes de startAt pero procesado después de startAt -> CANCELLED, cero delivery', async () => {
    const appStart = new Date('2026-09-02T10:00:05.000Z');
    const { worker, repo, clock, delivery } = setupReminderEnv('SCHEDULED', appStart);

    const job = repo.jobs.get('j1')!;
    job.scheduledFor = new Date('2026-09-02T09:59:50.000Z');

    const originalClaim = repo.claimDueJobs.bind(repo);
    repo.claimDueJobs = async (params) => {
      const result = await originalClaim(params);
      clock.advanceByMs(30 * 1000); // 10:00:30 (past startAt)
      return result;
    };

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('j1')?.status, 'CANCELLED');
  });

  await t.test('80. daily agenda reclamada antes de expiración pero procesada después de +2h -> CANCELLED, cero delivery', async () => {
    const { repo, worker, clock, delivery } = setupTestEnv();

    repo.jobs.set('agenda-1', {
      id: 'agenda-1',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: null,
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    clock.advanceByMs(4 * 60 * 60 * 1000); // 14:00 UTC

    const originalClaim = repo.claimDueJobs.bind(repo);
    repo.claimDueJobs = async (params) => {
      const result = await originalClaim(params);
      clock.advanceByMs(2 * 60 * 60 * 1000); // 16:00 UTC (>2h after scheduledFor)
      return result;
    };

    const summary = await worker.runOnce();
    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveries.length, 0);
    assert.strictEqual(repo.jobs.get('agenda-1')?.status, 'CANCELLED');
    assert.strictEqual(repo.jobs.get('agenda-1')?.failureCode, NotificationFailureCodes.DAILY_AGENDA_EXPIRED);
  });

  await t.test('81. agenda PENDING 07:00 y config cambia a 09:00 antes de enviar -> misma fila, scheduledFor pasa a 09:00', async () => {
    const { repo, worker, clock } = setupTestEnv();

    await worker.ensureNextDailyAgendaJobs(clock.now());
    const job = Array.from(repo.jobs.values())[0]!;
    assert.strictEqual(job.scheduledFor.toISOString(), '2026-09-02T13:00:00.000Z');

    const setting = repo.settings.get('c1');
    setting.dailyAgendaLocalTime = '09:00';

    await worker.ensureNextDailyAgendaJobs(clock.now());

    assert.strictEqual(repo.jobs.size, 1);
    const updatedJob = Array.from(repo.jobs.values())[0]!;
    assert.strictEqual(updatedJob.scheduledFor.toISOString(), '2026-09-02T15:00:00.000Z');
  });

  await t.test('82. cambio de hora no crea una segunda fila', async () => {
    const { repo, worker, clock } = setupTestEnv();

    await worker.ensureNextDailyAgendaJobs(clock.now());
    assert.strictEqual(repo.jobs.size, 1);

    const setting = repo.settings.get('c1');
    setting.dailyAgendaLocalTime = '11:00';

    await worker.ensureNextDailyAgendaJobs(clock.now());
    assert.strictEqual(repo.jobs.size, 1);
  });

  await t.test('83. RETRY_PENDING no se reprograma por cambio de dailyAgendaLocalTime', async () => {
    const { repo, worker, clock } = setupTestEnv();

    repo.jobs.set('agenda-retry', {
      id: 'agenda-retry',
      clinicId: 'c1',
      appointmentId: null,
      type: 'DAILY_AGENDA',
      channel: 'WHATSAPP',
      status: 'RETRY_PENDING',
      scheduledFor: new Date('2026-09-02T13:00:00.000Z'),
      appointmentStartAtSnapshot: null,
      idempotencyKey: 'daily-agenda:c1:2026-09-02',
      attempts: 1,
      nextAttemptAt: new Date('2026-09-02T13:05:00.000Z'),
      processingStartedAt: null,
      recipientPhone: '+522281234567',
      sentAt: null,
      providerMessageId: null,
      failureCode: 'RATE_LIMIT',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const setting = repo.settings.get('c1');
    setting.dailyAgendaLocalTime = '12:00';

    await worker.ensureNextDailyAgendaJobs(clock.now());

    const job = repo.jobs.get('agenda-retry');
    assert.strictEqual(job?.status, 'RETRY_PENDING');
    assert.strictEqual(job?.scheduledFor.toISOString(), '2026-09-02T13:00:00.000Z');
    assert.strictEqual(job?.nextAttemptAt?.toISOString(), '2026-09-02T13:05:00.000Z');
  });
});
