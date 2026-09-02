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

export type DeliveryResultStatus =
  | 'SENT'
  | 'RETRYABLE_FAILURE'
  | 'PERMANENT_FAILURE'
  | 'AMBIGUOUS_FAILURE';

export type NotificationDeliveryResult =
  | { status: 'SENT'; providerMessageId: string }
  | { status: 'RETRYABLE_FAILURE'; failureCode: string }
  | { status: 'PERMANENT_FAILURE'; failureCode: string }
  | { status: 'AMBIGUOUS_FAILURE'; failureCode: string };

export interface NotificationDeliveryParams {
  channel: NotificationChannelType;
  recipient: string;
  body: string;
  jobId: string;
}

export const NotificationFailureCodes = {
  PROCESSING_TIMEOUT_AMBIGUOUS: 'PROCESSING_TIMEOUT_AMBIGUOUS',
  RECIPIENT_PHONE_MISSING: 'RECIPIENT_PHONE_MISSING',
  RECIPIENT_PHONE_INVALID: 'RECIPIENT_PHONE_INVALID',
  DAILY_AGENDA_RECIPIENT_MISSING: 'DAILY_AGENDA_RECIPIENT_MISSING',
  DAILY_AGENDA_RECIPIENT_INVALID: 'DAILY_AGENDA_RECIPIENT_INVALID',
  DAILY_AGENDA_EXPIRED: 'DAILY_AGENDA_EXPIRED',
  DAILY_AGENDA_DATE_MISMATCH: 'DAILY_AGENDA_DATE_MISMATCH',
  INVALID_CLINIC_TIMEZONE: 'INVALID_CLINIC_TIMEZONE',
  MAX_ATTEMPTS_EXCEEDED: 'MAX_ATTEMPTS_EXCEEDED',
  RETRY_EXCEEDS_EXPIRATION: 'RETRY_EXCEEDS_EXPIRATION',
  DELIVERY_UNEXPECTED_EXCEPTION: 'DELIVERY_UNEXPECTED_EXCEPTION'
} as const;

export type NotificationFailureCode =
  (typeof NotificationFailureCodes)[keyof typeof NotificationFailureCodes];
