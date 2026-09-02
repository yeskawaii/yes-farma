export type NotificationChannelType = 'WHATSAPP';

export type NotificationJobTypeValue = 'APPOINTMENT_REMINDER_24H' | 'DAILY_AGENDA';

export type NotificationJobStatusValue =
  | 'PENDING'
  | 'PROCESSING'
  | 'RETRY_PENDING'
  | 'SENT'
  | 'CANCELLED'
  | 'FAILED';

export interface ClinicNotificationSettingsDto {
  id: string;
  clinicId: string;
  whatsappEnabled: boolean;
  appointmentReminder24hEnabled: boolean;
  dailyAgendaEnabled: boolean;
  dailyAgendaLocalTime: string;
  dailyAgendaRecipientPhone: string | null;
  defaultCountryCallingCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationJobDto {
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
