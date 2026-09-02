import {
  NotificationJobDto
} from './NotificationTypes';

export interface AppointmentReminderContext {
  clinicId: string;
  clinicName: string;
  clinicTimeZone: string;
  clinicStatus: string;
  whatsappEnabled: boolean;
  appointmentReminder24hEnabled: boolean;
  defaultCountryCallingCode: string;
  appointmentId: string;
  appointmentStatus: string;
  appointmentStartAt: Date;
  patientFirstName: string;
  patientPhone: string | null;
}

export interface DailyAgendaAppointmentItem {
  startAt: Date;
  patientFirstName: string;
  patientLastName: string | null;
}

export interface DailyAgendaContext {
  clinicId: string;
  clinicName: string;
  clinicTimeZone: string;
  clinicStatus: string;
  whatsappEnabled: boolean;
  dailyAgendaEnabled: boolean;
  dailyAgendaRecipientPhone: string | null;
  defaultCountryCallingCode: string;
  appointments: DailyAgendaAppointmentItem[];
}

export interface DailyAgendaClinicConfig {
  clinicId: string;
  timeZone: string;
  dailyAgendaLocalTime: string;
}

export interface ClaimDueJobsParams {
  now: Date;
  limit: number;
}

export interface FailStaleProcessingParams {
  threshold: Date;
  failureCode: string;
}

export interface EnsureDailyAgendaJobParams {
  clinicId: string;
  scheduledFor: Date;
  idempotencyKey: string;
}

export interface MarkSentParams {
  id: string;
  sentAt: Date;
  providerMessageId: string;
}

export interface MarkRetryPendingParams {
  id: string;
  nextAttemptAt: Date;
  failureCode: string;
}

export interface MarkFailedParams {
  id: string;
  failureCode: string;
}

export interface MarkCancelledParams {
  id: string;
  failureCode?: string;
}

export interface UpdateRecipientPhoneParams {
  id: string;
  recipientPhone: string;
}

export interface INotificationJobRepository {
  claimDueJobs(params: ClaimDueJobsParams): Promise<NotificationJobDto[]>;

  failStaleProcessing(params: FailStaleProcessingParams): Promise<number>;

  findReminderContext(job: NotificationJobDto): Promise<AppointmentReminderContext | null>;

  findDailyAgendaContext(job: NotificationJobDto): Promise<DailyAgendaContext | null>;

  listDailyAgendaEnabledClinics(): Promise<DailyAgendaClinicConfig[]>;

  ensureDailyAgendaJob(params: EnsureDailyAgendaJobParams): Promise<void>;

  markSent(params: MarkSentParams): Promise<boolean>;

  markRetryPending(params: MarkRetryPendingParams): Promise<boolean>;

  markFailed(params: MarkFailedParams): Promise<boolean>;

  markCancelled(params: MarkCancelledParams): Promise<boolean>;

  updateRecipientPhone(params: UpdateRecipientPhoneParams): Promise<boolean>;
}
