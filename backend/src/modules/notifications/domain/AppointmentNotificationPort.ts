import {
  NotificationChannelType,
  NotificationJobStatusValue,
  NotificationJobTypeValue
} from './NotificationTypes';

export interface ScheduleAppointmentReminderParams {
  clinicId: string;
  appointmentId: string;
  startAt: Date;
}

export interface RescheduleAppointmentReminderParams {
  clinicId: string;
  appointmentId: string;
  startAtChanged: boolean;
  newStartAt: Date;
}

export interface CancelAppointmentRemindersParams {
  clinicId: string;
  appointmentId: string;
}

export interface IAppointmentNotificationTx {
  clinicNotificationSettings: {
    findUnique(args: { where: { clinicId: string } }): Promise<{
      whatsappEnabled: boolean;
      appointmentReminder24hEnabled: boolean;
    } | null>;
  };
  notificationJob: {
    findUnique(args: {
      where: { clinicId_idempotencyKey: { clinicId: string; idempotencyKey: string } };
    }): Promise<{
      id: string;
      status: NotificationJobStatusValue;
      scheduledFor: Date;
      appointmentStartAtSnapshot: Date | null;
      attempts: number;
    } | null>;
    create(args: {
      data: {
        clinicId: string;
        appointmentId: string;
        type: NotificationJobTypeValue;
        channel: NotificationChannelType;
        status: NotificationJobStatusValue;
        scheduledFor: Date;
        appointmentStartAtSnapshot: Date;
        idempotencyKey: string;
      };
    }): Promise<unknown>;
    update(args: {
      where: { clinicId_idempotencyKey: { clinicId: string; idempotencyKey: string } };
      data: {
        status: NotificationJobStatusValue;
        scheduledFor: Date;
        appointmentStartAtSnapshot: Date;
        attempts: number;
        nextAttemptAt: null;
        processingStartedAt: null;
        sentAt: null;
        providerMessageId: null;
        failureCode: null;
      };
    }): Promise<unknown>;
    updateMany(args: {
      where: {
        clinicId: string;
        appointmentId: string;
        type: NotificationJobTypeValue;
        status: { in: ('PENDING' | 'RETRY_PENDING')[] };
      };
      data: {
        status: 'CANCELLED';
      };
    }): Promise<{ count: number }>;
  };
}

export interface IAppointmentNotificationPort {
  scheduleAppointmentReminder(
    tx: IAppointmentNotificationTx,
    params: ScheduleAppointmentReminderParams
  ): Promise<void>;

  handleAppointmentRescheduled(
    tx: IAppointmentNotificationTx,
    params: RescheduleAppointmentReminderParams
  ): Promise<void>;

  cancelAppointmentReminders(
    tx: IAppointmentNotificationTx,
    params: CancelAppointmentRemindersParams
  ): Promise<void>;
}

export class NoopAppointmentNotificationPort implements IAppointmentNotificationPort {
  async scheduleAppointmentReminder(): Promise<void> {}
  async handleAppointmentRescheduled(): Promise<void> {}
  async cancelAppointmentReminders(): Promise<void> {}
}
