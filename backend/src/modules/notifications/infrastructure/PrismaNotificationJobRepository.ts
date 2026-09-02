import { PrismaClient, Prisma } from '../../../generated/prisma';
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
} from '../domain/NotificationJobRepositoryPort';
import {
  NotificationJobDto,
  NotificationJobTypeValue,
  NotificationChannelType,
  NotificationJobStatusValue
} from '../domain/NotificationTypes';
import { TimezoneUtil } from '../domain/TimezoneUtil';

interface ClaimedJobRow {
  id: string;
  clinicId: string;
  appointmentId: string | null;
  type: NotificationJobTypeValue;
  channel: NotificationChannelType;
  status: NotificationJobStatusValue;
  scheduledFor: Date;
  appointmentStartAtSnapshot: Date | null;
  idempotencyKey: string;
  attempts: number;
  nextAttemptAt: Date | null;
  processingStartedAt: Date | null;
  recipientPhone: string | null;
  sentAt: Date | null;
  providerMessageId: string | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PrismaNotificationJobRepository implements INotificationJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapToDto(job: ClaimedJobRow): NotificationJobDto {
    return {
      id: job.id,
      clinicId: job.clinicId,
      appointmentId: job.appointmentId,
      type: job.type,
      channel: job.channel,
      status: job.status,
      scheduledFor: job.scheduledFor,
      appointmentStartAtSnapshot: job.appointmentStartAtSnapshot,
      idempotencyKey: job.idempotencyKey,
      attempts: job.attempts,
      nextAttemptAt: job.nextAttemptAt,
      processingStartedAt: job.processingStartedAt,
      recipientPhone: job.recipientPhone,
      sentAt: job.sentAt,
      providerMessageId: job.providerMessageId,
      failureCode: job.failureCode,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }

  async claimDueJobs(params: ClaimDueJobsParams): Promise<NotificationJobDto[]> {
    const claimed = await this.prisma.$queryRaw<ClaimedJobRow[]>(Prisma.sql`
      WITH claimable AS (
        SELECT id
        FROM "NotificationJob"
        WHERE (
          (status = 'PENDING'::"NotificationJobStatus" AND "scheduledFor" <= ${params.now})
          OR (status = 'RETRY_PENDING'::"NotificationJobStatus" AND "nextAttemptAt" IS NOT NULL AND "nextAttemptAt" <= ${params.now})
        )
        ORDER BY "scheduledFor" ASC, id ASC
        LIMIT ${params.limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "NotificationJob"
      SET
        status = 'PROCESSING'::"NotificationJobStatus",
        "processingStartedAt" = ${params.now},
        attempts = attempts + 1,
        "updatedAt" = ${params.now}
      FROM claimable
      WHERE "NotificationJob".id = claimable.id
      RETURNING "NotificationJob".*;
    `);

    return claimed.map((job) => this.mapToDto(job));
  }

  async failStaleProcessing(params: FailStaleProcessingParams): Promise<number> {
    const result = await this.prisma.notificationJob.updateMany({
      where: {
        status: 'PROCESSING',
        processingStartedAt: { lte: params.threshold }
      },
      data: {
        status: 'FAILED',
        failureCode: params.failureCode,
        processingStartedAt: null,
        nextAttemptAt: null
      }
    });

    return result.count;
  }

  async findReminderContext(job: NotificationJobDto): Promise<AppointmentReminderContext | null> {
    if (!job.appointmentId) {
      return null;
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: job.appointmentId,
        clinicId: job.clinicId
      },
      include: {
        clinic: {
          include: {
            notificationSettings: true
          }
        },
        patient: true
      }
    });

    if (!appointment || !appointment.clinic) {
      return null;
    }

    const settings = appointment.clinic.notificationSettings;

    return {
      clinicId: appointment.clinicId,
      clinicName: appointment.clinic.name,
      clinicTimeZone: appointment.clinic.timeZone,
      clinicStatus: appointment.clinic.status,
      whatsappEnabled: settings?.whatsappEnabled ?? false,
      appointmentReminder24hEnabled: settings?.appointmentReminder24hEnabled ?? false,
      defaultCountryCallingCode: settings?.defaultCountryCallingCode ?? '52',
      appointmentId: appointment.id,
      appointmentStatus: appointment.status,
      appointmentStartAt: appointment.startAt,
      patientFirstName: appointment.patient.firstName,
      patientPhone: appointment.patient.phone
    };
  }

  async findDailyAgendaContext(job: NotificationJobDto): Promise<DailyAgendaContext | null> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: job.clinicId },
      include: {
        notificationSettings: true
      }
    });

    if (!clinic || !clinic.notificationSettings) {
      return null;
    }

    const timeZone = clinic.timeZone;
    if (!TimezoneUtil.isValidTimezone(timeZone)) {
      return {
        clinicId: clinic.id,
        clinicName: clinic.name,
        clinicTimeZone: timeZone,
        clinicStatus: clinic.status,
        whatsappEnabled: clinic.notificationSettings.whatsappEnabled,
        dailyAgendaEnabled: clinic.notificationSettings.dailyAgendaEnabled,
        dailyAgendaRecipientPhone: clinic.notificationSettings.dailyAgendaRecipientPhone,
        defaultCountryCallingCode: clinic.notificationSettings.defaultCountryCallingCode,
        appointments: []
      };
    }

    const dayRange = TimezoneUtil.getLocalDayRangeUtc(job.scheduledFor, timeZone);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinicId: job.clinicId,
        startAt: {
          gte: dayRange.startUtc,
          lt: dayRange.endUtc
        },
        status: {
          in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS']
        }
      },
      include: {
        patient: true
      },
      orderBy: {
        startAt: 'asc'
      }
    });

    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicTimeZone: timeZone,
      clinicStatus: clinic.status,
      whatsappEnabled: clinic.notificationSettings.whatsappEnabled,
      dailyAgendaEnabled: clinic.notificationSettings.dailyAgendaEnabled,
      dailyAgendaRecipientPhone: clinic.notificationSettings.dailyAgendaRecipientPhone,
      defaultCountryCallingCode: clinic.notificationSettings.defaultCountryCallingCode,
      appointments: appointments.map((app) => ({
        startAt: app.startAt,
        patientFirstName: app.patient.firstName,
        patientLastName: app.patient.lastName
      }))
    };
  }

  async listDailyAgendaEnabledClinics(): Promise<DailyAgendaClinicConfig[]> {
    const settingsList = await this.prisma.clinicNotificationSettings.findMany({
      where: {
        dailyAgendaEnabled: true,
        whatsappEnabled: true,
        dailyAgendaRecipientPhone: { not: null },
        clinic: {
          status: 'ACTIVE'
        }
      },
      include: {
        clinic: true
      }
    });

    return settingsList.map((s) => ({
      clinicId: s.clinicId,
      timeZone: s.clinic.timeZone,
      dailyAgendaLocalTime: s.dailyAgendaLocalTime
    }));
  }

  async ensureDailyAgendaJob(params: EnsureDailyAgendaJobParams): Promise<void> {
    try {
      await this.prisma.notificationJob.create({
        data: {
          clinicId: params.clinicId,
          type: 'DAILY_AGENDA',
          channel: 'WHATSAPP',
          status: 'PENDING',
          scheduledFor: params.scheduledFor,
          idempotencyKey: params.idempotencyKey
        }
      });
      return;
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Concurrency collision: row already exists, continue to conditional CAS updates
      } else {
        throw error;
      }
    }

    // Reactivate if CANCELLED
    await this.prisma.notificationJob.updateMany({
      where: {
        clinicId: params.clinicId,
        idempotencyKey: params.idempotencyKey,
        status: 'CANCELLED'
      },
      data: {
        status: 'PENDING',
        scheduledFor: params.scheduledFor,
        attempts: 0,
        nextAttemptAt: null,
        processingStartedAt: null,
        recipientPhone: null,
        sentAt: null,
        providerMessageId: null,
        failureCode: null
      }
    });

    // Update scheduledFor if PENDING with drift
    await this.prisma.notificationJob.updateMany({
      where: {
        clinicId: params.clinicId,
        idempotencyKey: params.idempotencyKey,
        status: 'PENDING',
        scheduledFor: { not: params.scheduledFor }
      },
      data: {
        scheduledFor: params.scheduledFor
      }
    });
  }

  async markSent(params: MarkSentParams): Promise<boolean> {
    const result = await this.prisma.notificationJob.updateMany({
      where: {
        id: params.id,
        status: 'PROCESSING'
      },
      data: {
        status: 'SENT',
        sentAt: params.sentAt,
        providerMessageId: params.providerMessageId,
        failureCode: null,
        nextAttemptAt: null,
        processingStartedAt: null
      }
    });

    return result.count > 0;
  }

  async markRetryPending(params: MarkRetryPendingParams): Promise<boolean> {
    const result = await this.prisma.notificationJob.updateMany({
      where: {
        id: params.id,
        status: 'PROCESSING'
      },
      data: {
        status: 'RETRY_PENDING',
        nextAttemptAt: params.nextAttemptAt,
        failureCode: params.failureCode,
        processingStartedAt: null
      }
    });

    return result.count > 0;
  }

  async markFailed(params: MarkFailedParams): Promise<boolean> {
    const result = await this.prisma.notificationJob.updateMany({
      where: {
        id: params.id,
        status: 'PROCESSING'
      },
      data: {
        status: 'FAILED',
        failureCode: params.failureCode,
        nextAttemptAt: null,
        processingStartedAt: null
      }
    });

    return result.count > 0;
  }

  async markCancelled(params: MarkCancelledParams): Promise<boolean> {
    const result = await this.prisma.notificationJob.updateMany({
      where: {
        id: params.id,
        status: 'PROCESSING'
      },
      data: {
        status: 'CANCELLED',
        failureCode: params.failureCode ?? null,
        nextAttemptAt: null,
        processingStartedAt: null
      }
    });

    return result.count > 0;
  }

  async updateRecipientPhone(params: UpdateRecipientPhoneParams): Promise<boolean> {
    const result = await this.prisma.notificationJob.updateMany({
      where: {
        id: params.id,
        status: 'PROCESSING'
      },
      data: {
        recipientPhone: params.recipientPhone
      }
    });

    return result.count > 0;
  }
}
