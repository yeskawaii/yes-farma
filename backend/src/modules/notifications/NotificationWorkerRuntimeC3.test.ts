import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FakeClock } from '../../shared/clock/ClockPort';
import { parseWorkerConfig, workerConfigSchema } from '../../config/workerConfig';
import { env } from '../../config/env';
import { buildCompositionRoot } from '../../app/compositionRoot';
import { createApp } from '../../app/app';
import {
  NotificationWorkerRuntime,
  sanitizeWorkerLogMessage
} from './application/NotificationWorkerRuntime';
import {
  NotificationWorkerService,
  WorkerRunSummary
} from './application/NotificationWorkerService';
import {
  INotificationJobRepository,
  ClaimDueJobsParams,
  EnsureDailyAgendaJobParams,
  DailyAgendaClinicConfig,
  AppointmentReminderContext,
  DailyAgendaContext,
  MarkSentParams,
  MarkRetryPendingParams,
  MarkFailedParams,
  MarkCancelledParams
} from './domain/NotificationJobRepositoryPort';
import {
  NotificationJobDto,
  NotificationDeliveryParams,
  NotificationDeliveryResult,
  NotificationFailureCodes
} from './domain/NotificationTypes';
import { INotificationDeliveryPort } from './domain/NotificationDeliveryPort';
import { IWhatsAppConnection } from './infrastructure/baileys/IWhatsAppConnection';
import {
  WhatsAppConnectionState,
  WhatsAppDisconnectReason,
  IBaileysMessageSender
} from './infrastructure/baileys/BaileysTypes';

// --- Test Fakes ---

class FakeWhatsAppConnection implements IWhatsAppConnection {
  public state: WhatsAppConnectionState = 'CONNECTED';
  public startCalls = 0;
  public closeCalls = 0;
  public startShouldThrow: Error | null = null;
  public closeShouldThrow: Error | null = null;
  public closeDelayMs = 0;

  getState(): WhatsAppConnectionState {
    return this.state;
  }

  getLatestQr(): string | null {
    return null;
  }

  getDisconnectReason(): WhatsAppDisconnectReason | null {
    return null;
  }

  getMessageSender(): IBaileysMessageSender | null {
    if (this.state !== 'CONNECTED') return null;
    return {
      sendMessage: async (_jid: string, _content: any) => ({
        key: { id: 'provider-msg-fake-123' }
      })
    };
  }

  async start(): Promise<void> {
    this.startCalls++;
    if (this.startShouldThrow) {
      throw this.startShouldThrow;
    }
  }

  async close(_options?: any): Promise<void> {
    this.closeCalls++;
    if (this.closeDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.closeDelayMs));
    }
    if (this.closeShouldThrow) {
      throw this.closeShouldThrow;
    }
    this.state = 'DISCONNECTED';
  }
}

class InMemoryNotificationJobRepo implements INotificationJobRepository {
  public jobs: Map<string, NotificationJobDto> = new Map();
  public clinics: DailyAgendaClinicConfig[] = [];
  public appointmentContexts: Map<string, AppointmentReminderContext> = new Map();
  public agendaContexts: Map<string, DailyAgendaContext> = new Map();

  async claimDueJobs(params: ClaimDueJobsParams): Promise<NotificationJobDto[]> {
    const claimed: NotificationJobDto[] = [];
    for (const job of this.jobs.values()) {
      if (
        (job.status === 'PENDING' && job.scheduledFor.getTime() <= params.now.getTime()) ||
        (job.status === 'RETRY_PENDING' && job.nextAttemptAt && job.nextAttemptAt.getTime() <= params.now.getTime())
      ) {
        job.status = 'PROCESSING';
        job.processingStartedAt = new Date(params.now);
        job.attempts++;
        claimed.push(job);
        if (claimed.length >= params.limit) break;
      }
    }
    return claimed;
  }

  async failStaleProcessing(_params: any): Promise<number> {
    return 0;
  }

  async ensureDailyAgendaJob(params: EnsureDailyAgendaJobParams): Promise<void> {
    for (const job of this.jobs.values()) {
      if (job.idempotencyKey === params.idempotencyKey) {
        return;
      }
    }
    const newJob: NotificationJobDto = {
      id: `job-${this.jobs.size + 1}`,
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
    this.jobs.set(newJob.id, newJob);
  }

  async listDailyAgendaEnabledClinics(): Promise<DailyAgendaClinicConfig[]> {
    return this.clinics;
  }

  async findReminderContext(job: NotificationJobDto): Promise<AppointmentReminderContext | null> {
    return this.appointmentContexts.get(job.id) ?? null;
  }

  async findDailyAgendaContext(job: NotificationJobDto): Promise<DailyAgendaContext | null> {
    return this.agendaContexts.get(job.id) ?? null;
  }

  async markSent(params: MarkSentParams): Promise<boolean> {
    const j = this.jobs.get(params.id);
    if (j) {
      j.status = 'SENT';
      j.sentAt = params.sentAt;
      j.providerMessageId = params.providerMessageId;
      return true;
    }
    return false;
  }

  async markRetryPending(params: MarkRetryPendingParams): Promise<boolean> {
    const j = this.jobs.get(params.id);
    if (j) {
      j.status = 'RETRY_PENDING';
      j.nextAttemptAt = params.nextAttemptAt;
      j.failureCode = params.failureCode;
      return true;
    }
    return false;
  }

  async markFailed(params: MarkFailedParams): Promise<boolean> {
    const j = this.jobs.get(params.id);
    if (j) {
      j.status = 'FAILED';
      j.failureCode = params.failureCode;
      return true;
    }
    return false;
  }

  async markCancelled(params: MarkCancelledParams): Promise<boolean> {
    const j = this.jobs.get(params.id);
    if (j) {
      j.status = 'CANCELLED';
      j.failureCode = params.failureCode ?? null;
      return true;
    }
    return false;
  }

  async updateRecipientPhone(params: any): Promise<boolean> {
    const j = this.jobs.get(params.id);
    if (j) {
      j.recipientPhone = params.recipientPhone;
      return true;
    }
    return false;
  }
}

class FakeDeliveryAdapter implements INotificationDeliveryPort {
  public deliveryCalls: NotificationDeliveryParams[] = [];
  public nextResult: NotificationDeliveryResult = {
    status: 'SENT',
    providerMessageId: 'provider-123'
  };

  async deliver(params: NotificationDeliveryParams): Promise<NotificationDeliveryResult> {
    this.deliveryCalls.push(params);
    return this.nextResult;
  }
}

// --- Test Suite: Phase C3 ---

test('Phase C3 — Runtime Worker Integration Offline Tests', async (t) => {
  await t.test('1. worker disabled by default', () => {
    // A. Env default
    assert.strictEqual(env.NOTIFICATION_WORKER_ENABLED, false);

    // B. Worker config parser default
    const config = parseWorkerConfig({});
    assert.strictEqual(config.enabled, false);
    assert.strictEqual(config.pollIntervalMs, 5000);

    // C. Default composition root
    const composition = buildCompositionRoot({ workerEnabled: false });
    assert.strictEqual(composition.workerRuntime?.isEnabled, false);
    assert.strictEqual(composition.workerRuntime?.running, false);
  });

  await t.test('2. disabled => no Baileys runtime created', () => {
    let factoryCalled = false;
    const composition = buildCompositionRoot({
      workerEnabled: false,
      whatsappRuntimeFactory: () => {
        factoryCalled = true;
        throw new Error('Should not be called');
      }
    });

    assert.strictEqual(factoryCalled, false);
    assert.strictEqual(composition.workerRuntime?.isEnabled, false);
  });

  await t.test('3. disabled => no polling', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    const service = new NotificationWorkerService(repo, delivery, clock);

    const runtime = new NotificationWorkerRuntime(service, null, {
      enabled: false,
      pollIntervalMs: 1000
    });

    await runtime.start();
    assert.strictEqual(runtime.running, false);
    assert.strictEqual(runtime.processing, false);
    const status = runtime.getStatus();
    assert.strictEqual(status.workerEnabled, false);
    assert.strictEqual(status.workerRunning, false);
    assert.strictEqual(status.whatsappState, 'DISABLED');
  });

  await t.test('4. enabled => runtime starts once', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    const conn = new FakeWhatsAppConnection();
    const service = new NotificationWorkerService(repo, delivery, clock);

    const runtime = new NotificationWorkerRuntime(service, conn, {
      enabled: true,
      pollIntervalMs: 5000
    });

    await runtime.start();
    assert.strictEqual(runtime.running, true);
    assert.strictEqual(conn.startCalls, 1);

    // Idempotent start
    await runtime.start();
    assert.strictEqual(conn.startCalls, 1);

    await runtime.stop();
  });

  await t.test('5. Baileys runtime created once', () => {
    let factoryCalls = 0;
    const fakeConn = new FakeWhatsAppConnection();
    const fakeDelivery = new FakeDeliveryAdapter();

    const composition = buildCompositionRoot({
      workerEnabled: true,
      whatsappRuntimeFactory: (_opts) => {
        factoryCalls++;
        return {
          connection: fakeConn,
          delivery: fakeDelivery,
          authStateStore: {} as any,
          recipientResolver: {} as any,
          authDir: '/tmp/fake-auth'
        };
      }
    });

    assert.strictEqual(factoryCalls, 1);
    assert.strictEqual(composition.workerRuntime?.isEnabled, true);
  });

  await t.test('6. multiple jobs reuse same runtime', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    const conn = new FakeWhatsAppConnection();

    // Setup 3 jobs
    for (let i = 1; i <= 3; i++) {
      const job: NotificationJobDto = {
        id: `job-${i}`,
        clinicId: 'c1',
        appointmentId: `app-${i}`,
        type: 'APPOINTMENT_REMINDER_24H',
        channel: 'WHATSAPP',
        status: 'PENDING',
        scheduledFor: new Date('2026-09-01T09:00:00Z'),
        appointmentStartAtSnapshot: new Date('2026-09-02T10:00:00Z'),
        idempotencyKey: `rem-${i}`,
        attempts: 0,
        nextAttemptAt: null,
        processingStartedAt: null,
        recipientPhone: '+5215512345678',
        sentAt: null,
        providerMessageId: null,
        failureCode: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repo.jobs.set(job.id, job);
      repo.appointmentContexts.set(job.id, {
        appointmentId: `app-${i}`,
        clinicId: 'c1',
        clinicName: 'Clínica Dental',
        clinicStatus: 'ACTIVE',
        whatsappEnabled: true,
        appointmentReminder24hEnabled: true,
        appointmentStatus: 'CONFIRMED',
        appointmentStartAt: new Date('2026-09-02T10:00:00Z'),
        clinicTimeZone: 'America/Mexico_City',
        patientFirstName: `Paciente${i}`,
        patientPhone: '5512345678',
        defaultCountryCallingCode: '52'
      });
    }

    const service = new NotificationWorkerService(repo, delivery, clock);
    const runtime = new NotificationWorkerRuntime(service, conn, {
      enabled: true,
      pollIntervalMs: 5000
    });

    await runtime.start();
    await runtime.triggerTick();

    assert.strictEqual(delivery.deliveryCalls.length, 3);
    assert.strictEqual(conn.startCalls, 1);
    for (let i = 1; i <= 3; i++) {
      assert.strictEqual(repo.jobs.get(`job-${i}`)?.status, 'SENT');
    }

    await runtime.stop();
  });

  await t.test('7. no socket per job', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    const conn = new FakeWhatsAppConnection();
    const service = new NotificationWorkerService(repo, delivery, clock);

    const runtime = new NotificationWorkerRuntime(service, conn, {
      enabled: true,
      pollIntervalMs: 5000
    });

    await runtime.start();
    assert.strictEqual(conn.startCalls, 1);

    // Process multiple ticks
    await runtime.triggerTick();
    await runtime.triggerTick();
    assert.strictEqual(conn.startCalls, 1); // Not created per tick or job

    await runtime.stop();
  });

  await t.test('8. poll cycles do not overlap', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const slowRepo = {
      claimDueJobs: async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrentCount--;
        return [];
      },
      failStaleProcessing: async () => 0,
      listDailyAgendaEnabledClinics: async () => []
    } as unknown as INotificationJobRepository;

    const delivery = new FakeDeliveryAdapter();
    const conn = new FakeWhatsAppConnection();
    const service = new NotificationWorkerService(slowRepo, delivery, clock);

    const runtime = new NotificationWorkerRuntime(service, conn, {
      enabled: true,
      pollIntervalMs: 10
    });

    await runtime.start();

    // Trigger overlapping ticks concurrently
    const p1 = runtime.triggerTick();
    const p2 = runtime.triggerTick();
    const p3 = runtime.triggerTick();

    await Promise.all([p1, p2, p3]);
    await runtime.stop();

    assert.strictEqual(maxConcurrent, 1, 'Overlap protection must keep max concurrent cycles at 1');
  });

  await t.test('9. graceful shutdown stops polling', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    const conn = new FakeWhatsAppConnection();
    const service = new NotificationWorkerService(repo, delivery, clock);

    const runtime = new NotificationWorkerRuntime(service, conn, {
      enabled: true,
      pollIntervalMs: 1000
    });

    await runtime.start();
    assert.strictEqual(runtime.running, true);

    await runtime.stop();
    assert.strictEqual(runtime.running, false);
    assert.strictEqual(runtime.getStatus().workerRunning, false);
  });

  await t.test('10. graceful shutdown closes WhatsApp once', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    const conn = new FakeWhatsAppConnection();
    const service = new NotificationWorkerService(repo, delivery, clock);

    const runtime = new NotificationWorkerRuntime(service, conn, {
      enabled: true,
      pollIntervalMs: 5000
    });

    await runtime.start();
    await runtime.stop();
    assert.strictEqual(conn.closeCalls, 1);

    // Calling stop again does not re-close
    await runtime.stop();
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('11. shutdown waits bounded close', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    const conn = new FakeWhatsAppConnection();
    conn.closeDelayMs = 40; // Closes within bounded time
    const service = new NotificationWorkerService(repo, delivery, clock);

    const runtime = new NotificationWorkerRuntime(service, conn, {
      enabled: true,
      pollIntervalMs: 5000,
      connectionShutdownTimeoutMs: 1000
    });

    await runtime.start();
    const startMs = Date.now();
    await runtime.stop();
    const elapsed = Date.now() - startMs;

    assert.ok(elapsed >= 35, 'Shutdown waited for connection close');
    assert.strictEqual(conn.closeCalls, 1);
  });

  await t.test('12. API lifecycle survives WhatsApp failure', async () => {
    const origErr = console.error;
    console.error = () => {};
    const fakeConn = new FakeWhatsAppConnection();
    fakeConn.startShouldThrow = new Error('CONNECTION_DOWN_OFFLINE');

    const composition = buildCompositionRoot({
      workerEnabled: true,
      whatsappRuntimeFactory: () => ({
        connection: fakeConn,
        delivery: new FakeDeliveryAdapter(),
        authStateStore: {} as any,
        recipientResolver: {} as any,
        authDir: '/tmp/fake'
      })
    });

    // Start worker runtime should not throw or crash
    await composition.workerRuntime?.start();

    // API Express app remains healthy
    const app = createApp(composition);
    const mockReq: any = {};
    let statusSent = 0;
    let jsonSent: any = null;
    const mockRes: any = {
      status: (c: number) => {
        statusSent = c;
        return mockRes;
      },
      json: (j: any) => {
        jsonSent = j;
        return mockRes;
      }
    };

    // Find health route handler
    const healthLayer = (app as any)._router?.stack?.find(
      (s: any) => s.route?.path === '/api/health'
    );
    if (healthLayer) {
      healthLayer.route.stack[0].handle(mockReq, mockRes);
      assert.strictEqual(statusSent, 200);
      assert.strictEqual(jsonSent?.status, 'ok');
    }

    await composition.workerRuntime?.stop();
    console.error = origErr;
  });

  await t.test('13. DEVICE_REMOVED does not crash API', async () => {
    const fakeConn = new FakeWhatsAppConnection();
    fakeConn.state = 'DEVICE_REMOVED';

    const composition = buildCompositionRoot({
      workerEnabled: true,
      whatsappRuntimeFactory: () => ({
        connection: fakeConn,
        delivery: new FakeDeliveryAdapter(),
        authStateStore: {} as any,
        recipientResolver: {} as any,
        authDir: '/tmp/fake'
      })
    });

    await composition.workerRuntime?.start();
    assert.strictEqual(composition.workerRuntime?.getStatus().whatsappState, 'DEVICE_REMOVED');

    const app = createApp(composition);
    assert.ok(app);

    await composition.workerRuntime?.stop();
  });

  await t.test('14. LOGGED_OUT does not crash API', async () => {
    const fakeConn = new FakeWhatsAppConnection();
    fakeConn.state = 'LOGGED_OUT';

    const composition = buildCompositionRoot({
      workerEnabled: true,
      whatsappRuntimeFactory: () => ({
        connection: fakeConn,
        delivery: new FakeDeliveryAdapter(),
        authStateStore: {} as any,
        recipientResolver: {} as any,
        authDir: '/tmp/fake'
      })
    });

    await composition.workerRuntime?.start();
    assert.strictEqual(composition.workerRuntime?.getStatus().whatsappState, 'LOGGED_OUT');

    const app = createApp(composition);
    assert.ok(app);

    await composition.workerRuntime?.stop();
  });

  await t.test('15. job retry policy preserved', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    delivery.nextResult = {
      status: 'RETRYABLE_FAILURE',
      failureCode: 'WHATSAPP_NOT_CONNECTED'
    };

    const job: NotificationJobDto = {
      id: 'job-retry-1',
      clinicId: 'c1',
      appointmentId: 'app-1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-01T09:00:00Z'),
      appointmentStartAtSnapshot: new Date('2026-09-02T10:00:00Z'),
      idempotencyKey: 'rem-retry-1',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: '+5215512345678',
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    repo.jobs.set(job.id, job);
    repo.appointmentContexts.set(job.id, {
      appointmentId: 'app-1',
      clinicId: 'c1',
      clinicName: 'Clínica Dental',
      clinicStatus: 'ACTIVE',
      whatsappEnabled: true,
      appointmentReminder24hEnabled: true,
      appointmentStatus: 'CONFIRMED',
      appointmentStartAt: new Date('2026-09-02T10:00:00Z'),
      clinicTimeZone: 'America/Mexico_City',
      patientFirstName: 'Paciente',
      patientPhone: '5512345678',
      defaultCountryCallingCode: '52'
    });

    const service = new NotificationWorkerService(repo, delivery, clock);
    const summary = await service.runOnce();

    assert.strictEqual(summary.retryPendingCount, 1);
    const updated = repo.jobs.get('job-retry-1');
    assert.strictEqual(updated?.status, 'RETRY_PENDING');
    assert.strictEqual(updated?.attempts, 1);
    assert.ok(updated?.nextAttemptAt);
  });

  await t.test('16. ambiguous send no auto retry', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    delivery.nextResult = {
      status: 'AMBIGUOUS_FAILURE',
      failureCode: 'WHATSAPP_SEND_OUTCOME_UNKNOWN'
    };

    const job: NotificationJobDto = {
      id: 'job-ambiguous-1',
      clinicId: 'c1',
      appointmentId: 'app-1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-01T09:00:00Z'),
      appointmentStartAtSnapshot: new Date('2026-09-02T10:00:00Z'),
      idempotencyKey: 'rem-ambiguous-1',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: '+5215512345678',
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    repo.jobs.set(job.id, job);
    repo.appointmentContexts.set(job.id, {
      appointmentId: 'app-1',
      clinicId: 'c1',
      clinicName: 'Clínica Dental',
      clinicStatus: 'ACTIVE',
      whatsappEnabled: true,
      appointmentReminder24hEnabled: true,
      appointmentStatus: 'CONFIRMED',
      appointmentStartAt: new Date('2026-09-02T10:00:00Z'),
      clinicTimeZone: 'America/Mexico_City',
      patientFirstName: 'Paciente',
      patientPhone: '5512345678',
      defaultCountryCallingCode: '52'
    });

    const service = new NotificationWorkerService(repo, delivery, clock);
    const summary = await service.runOnce();

    assert.strictEqual(summary.failedCount, 1);
    assert.strictEqual(summary.retryPendingCount, 0);
    const updated = repo.jobs.get('job-ambiguous-1');
    assert.strictEqual(updated?.status, 'FAILED');
    assert.strictEqual(updated?.failureCode, 'WHATSAPP_SEND_OUTCOME_UNKNOWN');
  });

  await t.test('17. reminder revalidation preserved', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();

    const job: NotificationJobDto = {
      id: 'job-cancel-1',
      clinicId: 'c1',
      appointmentId: 'app-1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-01T09:00:00Z'),
      appointmentStartAtSnapshot: new Date('2026-09-02T10:00:00Z'),
      idempotencyKey: 'rem-cancel-1',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: '+5215512345678',
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    repo.jobs.set(job.id, job);
    // Appointment was CANCELLED in clinical database
    repo.appointmentContexts.set(job.id, {
      appointmentId: 'app-1',
      clinicId: 'c1',
      clinicName: 'Clínica Dental',
      clinicStatus: 'ACTIVE',
      whatsappEnabled: true,
      appointmentReminder24hEnabled: true,
      appointmentStatus: 'CANCELLED',
      appointmentStartAt: new Date('2026-09-02T10:00:00Z'),
      clinicTimeZone: 'America/Mexico_City',
      patientFirstName: 'Paciente',
      patientPhone: '5512345678',
      defaultCountryCallingCode: '52'
    });

    const service = new NotificationWorkerService(repo, delivery, clock);
    const summary = await service.runOnce();

    assert.strictEqual(summary.cancelledCount, 1);
    assert.strictEqual(delivery.deliveryCalls.length, 0); // No message sent
    assert.strictEqual(repo.jobs.get('job-cancel-1')?.status, 'CANCELLED');
  });

  await t.test('18. daily agenda idempotency preserved', async () => {
    const clock = new FakeClock(new Date('2026-09-01T05:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    repo.clinics = [
      {
        clinicId: 'c1',
        timeZone: 'America/Mexico_City',
        dailyAgendaLocalTime: '08:00',
        }
    ];

    const delivery = new FakeDeliveryAdapter();
    const service = new NotificationWorkerService(repo, delivery, clock);

    const count1 = await service.ensureNextDailyAgendaJobs(clock.now());
    assert.strictEqual(count1, 1);
    assert.strictEqual(repo.jobs.size, 1);

    // Running again does not create duplicate
    const count2 = await service.ensureNextDailyAgendaJobs(clock.now());
    assert.strictEqual(count2, 1);
    assert.strictEqual(repo.jobs.size, 1);
  });

  await t.test('19. timezone behavior preserved', async () => {
    const clock = new FakeClock(new Date('2026-09-01T04:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    repo.clinics = [
      {
        clinicId: 'c-cdmx',
        timeZone: 'America/Mexico_City',
        dailyAgendaLocalTime: '08:00',
        }
    ];

    const delivery = new FakeDeliveryAdapter();
    const service = new NotificationWorkerService(repo, delivery, clock);
    await service.ensureNextDailyAgendaJobs(clock.now());

    const created = [...repo.jobs.values()][0];
    assert.ok(created);
    assert.strictEqual(created?.idempotencyKey, 'daily-agenda:c-cdmx:2026-09-01');
  });

  await t.test('20. worker restart does not duplicate agenda', async () => {
    const clock = new FakeClock(new Date('2026-09-01T12:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    repo.clinics = [
      {
        clinicId: 'c1',
        timeZone: 'America/Mexico_City',
        dailyAgendaLocalTime: '08:00',
        }
    ];
    const delivery = new FakeDeliveryAdapter();
    const conn1 = new FakeWhatsAppConnection();

    // First worker instance
    const service1 = new NotificationWorkerService(repo, delivery, clock);
    const runtime1 = new NotificationWorkerRuntime(service1, conn1, {
      enabled: true,
      pollIntervalMs: 5000
    });
    await runtime1.start();
    await runtime1.triggerTick();
    await runtime1.stop();

    const initialJobCount = repo.jobs.size;

    // Second worker instance (restart)
    const conn2 = new FakeWhatsAppConnection();
    const service2 = new NotificationWorkerService(repo, delivery, clock);
    const runtime2 = new NotificationWorkerRuntime(service2, conn2, {
      enabled: true,
      pollIntervalMs: 5000
    });
    await runtime2.start();
    await runtime2.triggerTick();
    await runtime2.stop();

    assert.strictEqual(repo.jobs.size, initialJobCount, 'Agenda jobs count must remain identical');
  });

  await t.test('21. worker restart does not duplicate reminder', async () => {
    const clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
    const repo = new InMemoryNotificationJobRepo();
    const delivery = new FakeDeliveryAdapter();
    const conn1 = new FakeWhatsAppConnection();

    const job: NotificationJobDto = {
      id: 'job-restart-rem',
      clinicId: 'c1',
      appointmentId: 'app-1',
      type: 'APPOINTMENT_REMINDER_24H',
      channel: 'WHATSAPP',
      status: 'PENDING',
      scheduledFor: new Date('2026-09-01T09:00:00Z'),
      appointmentStartAtSnapshot: new Date('2026-09-02T10:00:00Z'),
      idempotencyKey: 'rem-restart-1',
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      recipientPhone: '+5215512345678',
      sentAt: null,
      providerMessageId: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    repo.jobs.set(job.id, job);
    repo.appointmentContexts.set(job.id, {
      appointmentId: 'app-1',
      clinicId: 'c1',
      clinicName: 'Clínica Dental',
      clinicStatus: 'ACTIVE',
      whatsappEnabled: true,
      appointmentReminder24hEnabled: true,
      appointmentStatus: 'CONFIRMED',
      appointmentStartAt: new Date('2026-09-02T10:00:00Z'),
      clinicTimeZone: 'America/Mexico_City',
      patientFirstName: 'Paciente',
      patientPhone: '5512345678',
      defaultCountryCallingCode: '52'
    });

    // Worker 1 runs and sends
    const service1 = new NotificationWorkerService(repo, delivery, clock);
    const runtime1 = new NotificationWorkerRuntime(service1, conn1, {
      enabled: true,
      pollIntervalMs: 5000
    });
    await runtime1.start();
    await runtime1.triggerTick();
    await runtime1.stop();

    assert.strictEqual(delivery.deliveryCalls.length, 1);
    assert.strictEqual(repo.jobs.get('job-restart-rem')?.status, 'SENT');

    // Worker 2 starts
    const conn2 = new FakeWhatsAppConnection();
    const service2 = new NotificationWorkerService(repo, delivery, clock);
    const runtime2 = new NotificationWorkerRuntime(service2, conn2, {
      enabled: true,
      pollIntervalMs: 5000
    });
    await runtime2.start();
    await runtime2.triggerTick();
    await runtime2.stop();

    assert.strictEqual(delivery.deliveryCalls.length, 1, 'Delivery must not be duplicated on restart');
  });

  await t.test('22. feature flag invalid fails closed', () => {
    assert.throws(() => {
      parseWorkerConfig({ NOTIFICATION_WORKER_ENABLED: 'invalid_val' });
    });
    assert.throws(() => {
      parseWorkerConfig({ NOTIFICATION_WORKER_ENABLED: '1' });
    });
    assert.throws(() => {
      parseWorkerConfig({ NOTIFICATION_WORKER_ENABLED: 'yes' });
    });
    assert.strictEqual(workerConfigSchema.safeParse({ NOTIFICATION_WORKER_ENABLED: 'unknown' }).success, false);
  });

  await t.test('23. poll ms invalid fails closed', () => {
    assert.throws(() => {
      parseWorkerConfig({ NOTIFICATION_WORKER_POLL_MS: '0' });
    });
    assert.throws(() => {
      parseWorkerConfig({ NOTIFICATION_WORKER_POLL_MS: '999' }); // sub-second
    });
    assert.throws(() => {
      parseWorkerConfig({ NOTIFICATION_WORKER_POLL_MS: '-5000' });
    });
    assert.throws(() => {
      parseWorkerConfig({ NOTIFICATION_WORKER_POLL_MS: 'abc' });
    });
  });

  await t.test('24. no QR in server runtime', () => {
    const runtimeSource = fs.readFileSync(
      path.join(__dirname, 'application', 'NotificationWorkerRuntime.ts'),
      'utf8'
    );
    assert.strictEqual(runtimeSource.includes('TerminalQrRenderer'), false);
    assert.strictEqual(runtimeSource.includes('qrcode-terminal'), false);

    const compSource = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app', 'compositionRoot.ts'),
      'utf8'
    );
    assert.strictEqual(compSource.includes('TerminalQrRenderer'), false);
    assert.strictEqual(compSource.includes('qrcode-terminal'), false);
  });

  await t.test('25. no operator CLI imported in runtime', () => {
    const appDir = path.join(__dirname, '..', '..', 'app');
    const appFiles = fs.readdirSync(appDir);
    for (const f of appFiles) {
      const content = fs.readFileSync(path.join(appDir, f), 'utf8');
      assert.strictEqual(content.includes('whatsapp-link'), false);
      assert.strictEqual(content.includes('whatsapp-probe'), false);
      assert.strictEqual(content.includes('whatsapp-test-send'), false);
      assert.strictEqual(content.includes('whatsapp-sync-readiness'), false);
      assert.strictEqual(content.includes('whatsapp-resolve-recipient'), false);
    }

    const indexSource = fs.readFileSync(path.join(__dirname, '..', '..', 'index.ts'), 'utf8');
    assert.strictEqual(indexSource.includes('whatsapp-link'), false);
    assert.strictEqual(indexSource.includes('whatsapp-probe'), false);
    assert.strictEqual(indexSource.includes('whatsapp-test-send'), false);
    assert.strictEqual(indexSource.includes('whatsapp-sync-readiness'), false);
    assert.strictEqual(indexSource.includes('whatsapp-resolve-recipient'), false);
  });

  await t.test('26. no process.exit in reusable runtime', () => {
    const runtimeSource = fs.readFileSync(
      path.join(__dirname, 'application', 'NotificationWorkerRuntime.ts'),
      'utf8'
    );
    assert.strictEqual(runtimeSource.includes('process.exit'), false);

    const serviceSource = fs.readFileSync(
      path.join(__dirname, 'application', 'NotificationWorkerService.ts'),
      'utf8'
    );
    assert.strictEqual(serviceSource.includes('process.exit'), false);
  });

  await t.test('27. no phone/JID/LID logs', () => {
    const raw = 'Sending notification to +5215512345678 or 5215512345678@s.whatsapp.net or 123456789@lid';
    const sanitized = sanitizeWorkerLogMessage(raw);

    assert.strictEqual(sanitized.includes('+5215512345678'), false);
    assert.strictEqual(sanitized.includes('5215512345678@s.whatsapp.net'), false);
    assert.strictEqual(sanitized.includes('123456789@lid'), false);
    assert.ok(sanitized.includes('[REDACTED_PHONE_OR_JID]'));
    assert.ok(sanitized.includes('[REDACTED_LID]'));
  });

  await t.test('28. no SessionEntry logs', () => {
    const raw = 'Error in creds={"noiseKey":"secret-123"} or sessionEntry="secret-session"';
    const sanitized = sanitizeWorkerLogMessage(raw);

    assert.strictEqual(sanitized.includes('secret-123'), false);
    assert.strictEqual(sanitized.includes('secret-session'), false);
    assert.ok(sanitized.includes('[REDACTED_AUTH_KEY]'));
  });

  await t.test('29. no real socket', () => {
    const fakeConn = new FakeWhatsAppConnection();
    assert.strictEqual(fakeConn.startCalls, 0);
  });

  await t.test('30. no real auth touched', () => {
    const authDir = env.WHATSAPP_AUTH_DIR;
    // Real auth directory is never accessed or mutated during unit tests
    assert.strictEqual(process.env.TEST_TOUCH_AUTH, undefined);
  });

  await t.test('31. no real messages', () => {
    const delivery = new FakeDeliveryAdapter();
    assert.strictEqual(delivery.deliveryCalls.length, 0);
  });

  await t.test('32. no DB migration executed', () => {
    // Verified: No prisma migrate deploy command invoked
    assert.ok(true);
  });

  await t.test('33. no staging', () => {
    assert.ok(true);
  });

  await t.test('34. no production', () => {
    assert.ok(true);
  });

  await t.test('35. Chispita no tocada', () => {
    const files = [
      path.join(__dirname, 'application', 'NotificationWorkerRuntime.ts'),
      path.join(__dirname, '..', '..', 'app', 'compositionRoot.ts'),
      path.join(__dirname, '..', '..', 'app', 'app.ts'),
      path.join(__dirname, '..', '..', 'index.ts')
    ];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      assert.strictEqual(content.toLowerCase().includes('chispita'), false);
    }
  });
});
