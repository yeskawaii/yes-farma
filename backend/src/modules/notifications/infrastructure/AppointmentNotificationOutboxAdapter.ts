import { IClock } from '../../../shared/clock/ClockPort';
import {
  IAppointmentNotificationPort,
  IAppointmentNotificationTx,
  ScheduleAppointmentReminderParams,
  RescheduleAppointmentReminderParams,
  CancelAppointmentRemindersParams
} from '../domain/AppointmentNotificationPort';

export class AppointmentNotificationOutboxAdapter implements IAppointmentNotificationPort {
  constructor(private readonly clock: IClock) {}

  private computeIdempotencyKey(appointmentId: string, startAt: Date): string {
    return `appointment-reminder-24h:${appointmentId}:${startAt.toISOString()}`;
  }

  private async ensureReminderJob(
    tx: IAppointmentNotificationTx,
    clinicId: string,
    appointmentId: string,
    startAt: Date,
    scheduledFor: Date,
    idempotencyKey: string
  ): Promise<void> {
    const existingJob = await tx.notificationJob.findUnique({
      where: {
        clinicId_idempotencyKey: {
          clinicId,
          idempotencyKey
        }
      }
    });

    if (!existingJob) {
      await tx.notificationJob.create({
        data: {
          clinicId,
          appointmentId,
          type: 'APPOINTMENT_REMINDER_24H',
          channel: 'WHATSAPP',
          status: 'PENDING',
          scheduledFor,
          appointmentStartAtSnapshot: startAt,
          idempotencyKey
        }
      });
      return;
    }

    if (existingJob.status === 'CANCELLED') {
      await tx.notificationJob.update({
        where: {
          clinicId_idempotencyKey: {
            clinicId,
            idempotencyKey
          }
        },
        data: {
          status: 'PENDING',
          scheduledFor,
          appointmentStartAtSnapshot: startAt,
          attempts: 0,
          nextAttemptAt: null,
          processingStartedAt: null,
          sentAt: null,
          providerMessageId: null,
          failureCode: null
        }
      });
    }
  }

  async scheduleAppointmentReminder(
    tx: IAppointmentNotificationTx,
    params: ScheduleAppointmentReminderParams
  ): Promise<void> {
    const settings = await tx.clinicNotificationSettings.findUnique({
      where: { clinicId: params.clinicId }
    });

    if (!settings || !settings.whatsappEnabled || !settings.appointmentReminder24hEnabled) {
      return;
    }

    const scheduledFor = new Date(params.startAt.getTime() - 24 * 60 * 60 * 1000);
    if (scheduledFor.getTime() <= this.clock.now().getTime()) {
      return;
    }

    const idempotencyKey = this.computeIdempotencyKey(params.appointmentId, params.startAt);
    await this.ensureReminderJob(
      tx,
      params.clinicId,
      params.appointmentId,
      params.startAt,
      scheduledFor,
      idempotencyKey
    );
  }

  async handleAppointmentRescheduled(
    tx: IAppointmentNotificationTx,
    params: RescheduleAppointmentReminderParams
  ): Promise<void> {
    if (!params.startAtChanged) {
      return;
    }

    await tx.notificationJob.updateMany({
      where: {
        clinicId: params.clinicId,
        appointmentId: params.appointmentId,
        type: 'APPOINTMENT_REMINDER_24H',
        status: { in: ['PENDING', 'RETRY_PENDING'] }
      },
      data: {
        status: 'CANCELLED'
      }
    });

    const settings = await tx.clinicNotificationSettings.findUnique({
      where: { clinicId: params.clinicId }
    });

    if (!settings || !settings.whatsappEnabled || !settings.appointmentReminder24hEnabled) {
      return;
    }

    const scheduledFor = new Date(params.newStartAt.getTime() - 24 * 60 * 60 * 1000);
    if (scheduledFor.getTime() <= this.clock.now().getTime()) {
      return;
    }

    const idempotencyKey = this.computeIdempotencyKey(params.appointmentId, params.newStartAt);
    await this.ensureReminderJob(
      tx,
      params.clinicId,
      params.appointmentId,
      params.newStartAt,
      scheduledFor,
      idempotencyKey
    );
  }

  async cancelAppointmentReminders(
    tx: IAppointmentNotificationTx,
    params: CancelAppointmentRemindersParams
  ): Promise<void> {
    await tx.notificationJob.updateMany({
      where: {
        clinicId: params.clinicId,
        appointmentId: params.appointmentId,
        type: 'APPOINTMENT_REMINDER_24H',
        status: { in: ['PENDING', 'RETRY_PENDING'] }
      },
      data: {
        status: 'CANCELLED'
      }
    });
  }
}
