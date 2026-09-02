import { IClock } from '../../../shared/clock/ClockPort';
import {
  INotificationJobRepository
} from '../domain/NotificationJobRepositoryPort';
import {
  INotificationDeliveryPort
} from '../domain/NotificationDeliveryPort';
import {
  NotificationFailureCodes,
  NotificationJobDto
} from '../domain/NotificationTypes';
import {
  IRetryPolicy,
  NotificationRetryPolicy
} from '../domain/NotificationRetryPolicy';
import { PhoneNormalizer } from '../domain/PhoneNormalizer';
import { TimezoneUtil } from '../domain/TimezoneUtil';
import { NotificationMessageComposer } from '../domain/NotificationMessageComposer';

export interface NotificationWorkerOptions {
  batchLimit?: number;
  staleProcessingTimeoutMs?: number;
  retryPolicy?: IRetryPolicy;
}

export interface WorkerRunSummary {
  staleFailedCount: number;
  dailyAgendaEnsuredCount: number;
  claimedCount: number;
  sentCount: number;
  retryPendingCount: number;
  failedCount: number;
  cancelledCount: number;
}

export class NotificationWorkerService {
  private readonly batchLimit: number;
  private readonly staleProcessingTimeoutMs: number;
  private readonly retryPolicy: IRetryPolicy;

  constructor(
    private readonly repository: INotificationJobRepository,
    private readonly deliveryPort: INotificationDeliveryPort,
    private readonly clock: IClock,
    options?: NotificationWorkerOptions
  ) {
    this.batchLimit = options?.batchLimit ?? 25;
    this.staleProcessingTimeoutMs = options?.staleProcessingTimeoutMs ?? 10 * 60 * 1000;
    this.retryPolicy = options?.retryPolicy ?? new NotificationRetryPolicy();
  }

  async runOnce(): Promise<WorkerRunSummary> {
    const cycleNow = this.clock.now();

    const summary: WorkerRunSummary = {
      staleFailedCount: 0,
      dailyAgendaEnsuredCount: 0,
      claimedCount: 0,
      sentCount: 0,
      retryPendingCount: 0,
      failedCount: 0,
      cancelledCount: 0
    };

    const staleThreshold = new Date(cycleNow.getTime() - this.staleProcessingTimeoutMs);
    summary.staleFailedCount = await this.repository.failStaleProcessing({
      threshold: staleThreshold,
      failureCode: NotificationFailureCodes.PROCESSING_TIMEOUT_AMBIGUOUS
    });

    summary.dailyAgendaEnsuredCount = await this.ensureNextDailyAgendaJobs(cycleNow);

    const claimedJobs = await this.repository.claimDueJobs({
      now: cycleNow,
      limit: this.batchLimit
    });
    summary.claimedCount = claimedJobs.length;

    for (const job of claimedJobs) {
      const jobNow = this.clock.now();
      try {
        const resultStatus = await this.processJob(job, jobNow);
        if (resultStatus === 'SENT') summary.sentCount++;
        else if (resultStatus === 'RETRY_PENDING') summary.retryPendingCount++;
        else if (resultStatus === 'FAILED') summary.failedCount++;
        else if (resultStatus === 'CANCELLED') summary.cancelledCount++;
      } catch {
        try {
          const applied = await this.repository.markFailed({
            id: job.id,
            failureCode: NotificationFailureCodes.DELIVERY_UNEXPECTED_EXCEPTION
          });
          if (applied) summary.failedCount++;
        } catch {
          // Maintain batch isolation
        }
      }
    }

    return summary;
  }

  async ensureNextDailyAgendaJobs(now: Date): Promise<number> {
    const clinics = await this.repository.listDailyAgendaEnabledClinics();
    let count = 0;

    for (const clinic of clinics) {
      const timeZone = clinic.timeZone;
      if (!TimezoneUtil.isValidTimezone(timeZone)) {
        continue;
      }

      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clinic.dailyAgendaLocalTime)) {
        continue;
      }

      const todayYmd = TimezoneUtil.getLocalYMD(now, timeZone);
      let targetYmd = todayYmd;
      let scheduledForUtc: Date;

      try {
        scheduledForUtc = TimezoneUtil.localYMDAndTimeToUtc(
          todayYmd,
          clinic.dailyAgendaLocalTime,
          timeZone
        );
      } catch {
        continue;
      }

      if (scheduledForUtc.getTime() <= now.getTime()) {
        const ymdParts = todayYmd.split('-');
        const nextDayCivil = new Date(Date.UTC(
          parseInt(ymdParts[0]!, 10),
          parseInt(ymdParts[1]!, 10) - 1,
          parseInt(ymdParts[2]!, 10) + 1
        ));
        const tomorrowLocalYmd = nextDayCivil.toISOString().slice(0, 10);
        targetYmd = tomorrowLocalYmd;

        try {
          scheduledForUtc = TimezoneUtil.localYMDAndTimeToUtc(
            tomorrowLocalYmd,
            clinic.dailyAgendaLocalTime,
            timeZone
          );
        } catch {
          continue;
        }
      }

      const idempotencyKey = `daily-agenda:${clinic.clinicId}:${targetYmd}`;

      await this.repository.ensureDailyAgendaJob({
        clinicId: clinic.clinicId,
        scheduledFor: scheduledForUtc,
        idempotencyKey
      });

      count++;
    }

    return count;
  }

  private async processJob(
    job: NotificationJobDto,
    now: Date
  ): Promise<'SENT' | 'RETRY_PENDING' | 'FAILED' | 'CANCELLED' | 'IGNORED'> {
    if (job.type === 'APPOINTMENT_REMINDER_24H') {
      return this.processAppointmentReminder(job, now);
    } else if (job.type === 'DAILY_AGENDA') {
      return this.processDailyAgenda(job, now);
    }

    const applied = await this.repository.markFailed({
      id: job.id,
      failureCode: 'UNKNOWN_JOB_TYPE'
    });
    return applied ? 'FAILED' : 'IGNORED';
  }

  private async processAppointmentReminder(
    job: NotificationJobDto,
    now: Date
  ): Promise<'SENT' | 'RETRY_PENDING' | 'FAILED' | 'CANCELLED' | 'IGNORED'> {
    const ctx = await this.repository.findReminderContext(job);

    if (
      !ctx ||
      ctx.clinicStatus !== 'ACTIVE' ||
      !ctx.whatsappEnabled ||
      !ctx.appointmentReminder24hEnabled ||
      (ctx.appointmentStatus !== 'SCHEDULED' && ctx.appointmentStatus !== 'CONFIRMED') ||
      ctx.appointmentStartAt.getTime() !== job.appointmentStartAtSnapshot?.getTime() ||
      now.getTime() >= ctx.appointmentStartAt.getTime()
    ) {
      const applied = await this.repository.markCancelled({ id: job.id });
      return applied ? 'CANCELLED' : 'IGNORED';
    }

    if (!TimezoneUtil.isValidTimezone(ctx.clinicTimeZone)) {
      const applied = await this.repository.markCancelled({
        id: job.id,
        failureCode: NotificationFailureCodes.INVALID_CLINIC_TIMEZONE
      });
      return applied ? 'CANCELLED' : 'IGNORED';
    }

    const phoneResult = PhoneNormalizer.normalize(
      ctx.patientPhone,
      ctx.defaultCountryCallingCode
    );

    if (!phoneResult.valid) {
      const failureCode =
        phoneResult.error === 'MISSING'
          ? NotificationFailureCodes.RECIPIENT_PHONE_MISSING
          : NotificationFailureCodes.RECIPIENT_PHONE_INVALID;
      const applied = await this.repository.markFailed({ id: job.id, failureCode });
      return applied ? 'FAILED' : 'IGNORED';
    }

    const ownershipPreserved = await this.repository.updateRecipientPhone({
      id: job.id,
      recipientPhone: phoneResult.e164
    });

    if (!ownershipPreserved) {
      return 'IGNORED';
    }

    const body = NotificationMessageComposer.composeAppointmentReminder({
      patientFirstName: ctx.patientFirstName,
      clinicName: ctx.clinicName,
      startAt: ctx.appointmentStartAt,
      timeZone: ctx.clinicTimeZone
    });

    let deliveryResult;
    try {
      deliveryResult = await this.deliveryPort.deliver({
        channel: job.channel,
        recipient: phoneResult.e164,
        body,
        jobId: job.id
      });
    } catch {
      deliveryResult = {
        status: 'AMBIGUOUS_FAILURE' as const,
        failureCode: NotificationFailureCodes.DELIVERY_UNEXPECTED_EXCEPTION
      };
    }

    if (deliveryResult.status === 'SENT') {
      const applied = await this.repository.markSent({
        id: job.id,
        sentAt: now,
        providerMessageId: deliveryResult.providerMessageId
      });
      return applied ? 'SENT' : 'IGNORED';
    }

    if (deliveryResult.status === 'RETRYABLE_FAILURE') {
      const nextAttemptAt = this.retryPolicy.calculateNextAttempt(job.attempts, now);
      const canRetry = this.retryPolicy.canRetry(
        job.attempts,
        nextAttemptAt,
        ctx.appointmentStartAt
      );

      if (canRetry) {
        const applied = await this.repository.markRetryPending({
          id: job.id,
          nextAttemptAt,
          failureCode: deliveryResult.failureCode
        });
        return applied ? 'RETRY_PENDING' : 'IGNORED';
      } else {
        if (job.attempts >= this.retryPolicy.maxAttempts) {
          const applied = await this.repository.markFailed({
            id: job.id,
            failureCode: deliveryResult.failureCode
          });
          return applied ? 'FAILED' : 'IGNORED';
        } else {
          const applied = await this.repository.markCancelled({
            id: job.id,
            failureCode: NotificationFailureCodes.RETRY_EXCEEDS_EXPIRATION
          });
          return applied ? 'CANCELLED' : 'IGNORED';
        }
      }
    }

    if (deliveryResult.status === 'PERMANENT_FAILURE' || deliveryResult.status === 'AMBIGUOUS_FAILURE') {
      const applied = await this.repository.markFailed({
        id: job.id,
        failureCode: deliveryResult.failureCode
      });
      return applied ? 'FAILED' : 'IGNORED';
    }

    return 'IGNORED';
  }

  private async processDailyAgenda(
    job: NotificationJobDto,
    now: Date
  ): Promise<'SENT' | 'RETRY_PENDING' | 'FAILED' | 'CANCELLED' | 'IGNORED'> {
    const expirationThreshold = new Date(job.scheduledFor.getTime() + 2 * 60 * 60 * 1000);
    if (now.getTime() >= expirationThreshold.getTime()) {
      const applied = await this.repository.markCancelled({
        id: job.id,
        failureCode: NotificationFailureCodes.DAILY_AGENDA_EXPIRED
      });
      return applied ? 'CANCELLED' : 'IGNORED';
    }

    const ctx = await this.repository.findDailyAgendaContext(job);

    if (
      !ctx ||
      ctx.clinicStatus !== 'ACTIVE' ||
      !ctx.whatsappEnabled ||
      !ctx.dailyAgendaEnabled ||
      !ctx.dailyAgendaRecipientPhone
    ) {
      const applied = await this.repository.markCancelled({ id: job.id });
      return applied ? 'CANCELLED' : 'IGNORED';
    }

    if (!TimezoneUtil.isValidTimezone(ctx.clinicTimeZone)) {
      const applied = await this.repository.markCancelled({
        id: job.id,
        failureCode: NotificationFailureCodes.INVALID_CLINIC_TIMEZONE
      });
      return applied ? 'CANCELLED' : 'IGNORED';
    }

    // Validate idempotencyKey and temporal identity
    const keyMatch = job.idempotencyKey.match(/^daily-agenda:([^:]+):(\d{4}-\d{2}-\d{2})$/);
    if (!keyMatch) {
      const applied = await this.repository.markCancelled({
        id: job.id,
        failureCode: NotificationFailureCodes.DAILY_AGENDA_DATE_MISMATCH
      });
      return applied ? 'CANCELLED' : 'IGNORED';
    }

    const keyClinicId = keyMatch[1];
    const keyDateYmd = keyMatch[2];
    const expectedLocalYmd = TimezoneUtil.getLocalYMD(job.scheduledFor, ctx.clinicTimeZone);

    if (keyClinicId !== job.clinicId || keyDateYmd !== expectedLocalYmd) {
      const applied = await this.repository.markCancelled({
        id: job.id,
        failureCode: NotificationFailureCodes.DAILY_AGENDA_DATE_MISMATCH
      });
      return applied ? 'CANCELLED' : 'IGNORED';
    }

    const phoneResult = PhoneNormalizer.normalize(
      ctx.dailyAgendaRecipientPhone,
      ctx.defaultCountryCallingCode
    );

    if (!phoneResult.valid) {
      const failureCode =
        phoneResult.error === 'MISSING'
          ? NotificationFailureCodes.DAILY_AGENDA_RECIPIENT_MISSING
          : NotificationFailureCodes.DAILY_AGENDA_RECIPIENT_INVALID;
      const applied = await this.repository.markFailed({ id: job.id, failureCode });
      return applied ? 'FAILED' : 'IGNORED';
    }

    const ownershipPreserved = await this.repository.updateRecipientPhone({
      id: job.id,
      recipientPhone: phoneResult.e164
    });

    if (!ownershipPreserved) {
      return 'IGNORED';
    }

    const body = NotificationMessageComposer.composeDailyAgenda({
      clinicName: ctx.clinicName,
      date: job.scheduledFor,
      appointments: ctx.appointments,
      timeZone: ctx.clinicTimeZone
    });

    let deliveryResult;
    try {
      deliveryResult = await this.deliveryPort.deliver({
        channel: job.channel,
        recipient: phoneResult.e164,
        body,
        jobId: job.id
      });
    } catch {
      deliveryResult = {
        status: 'AMBIGUOUS_FAILURE' as const,
        failureCode: NotificationFailureCodes.DELIVERY_UNEXPECTED_EXCEPTION
      };
    }

    if (deliveryResult.status === 'SENT') {
      const applied = await this.repository.markSent({
        id: job.id,
        sentAt: now,
        providerMessageId: deliveryResult.providerMessageId
      });
      return applied ? 'SENT' : 'IGNORED';
    }

    if (deliveryResult.status === 'RETRYABLE_FAILURE') {
      const nextAttemptAt = this.retryPolicy.calculateNextAttempt(job.attempts, now);
      const canRetry = this.retryPolicy.canRetry(
        job.attempts,
        nextAttemptAt,
        expirationThreshold
      );

      if (canRetry) {
        const applied = await this.repository.markRetryPending({
          id: job.id,
          nextAttemptAt,
          failureCode: deliveryResult.failureCode
        });
        return applied ? 'RETRY_PENDING' : 'IGNORED';
      } else {
        if (job.attempts >= this.retryPolicy.maxAttempts) {
          const applied = await this.repository.markFailed({
            id: job.id,
            failureCode: deliveryResult.failureCode
          });
          return applied ? 'FAILED' : 'IGNORED';
        } else {
          const applied = await this.repository.markCancelled({
            id: job.id,
            failureCode: NotificationFailureCodes.DAILY_AGENDA_EXPIRED
          });
          return applied ? 'CANCELLED' : 'IGNORED';
        }
      }
    }

    if (deliveryResult.status === 'PERMANENT_FAILURE' || deliveryResult.status === 'AMBIGUOUS_FAILURE') {
      const applied = await this.repository.markFailed({
        id: job.id,
        failureCode: deliveryResult.failureCode
      });
      return applied ? 'FAILED' : 'IGNORED';
    }

    return 'IGNORED';
  }
}
