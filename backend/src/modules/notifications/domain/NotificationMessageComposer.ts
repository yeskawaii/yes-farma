import { TimezoneUtil } from './TimezoneUtil';

export interface ComposeAppointmentReminderParams {
  patientFirstName: string;
  clinicName: string;
  startAt: Date;
  timeZone: string;
}

export interface AgendaAppointmentItem {
  startAt: Date;
  patientFirstName: string;
  patientLastName?: string | null;
}

export interface ComposeDailyAgendaParams {
  clinicName: string;
  date: Date;
  appointments: AgendaAppointmentItem[];
  timeZone: string;
}

export class NotificationMessageComposer {
  /**
   * Composes a patient appointment reminder message.
   * STRICT PRIVACY: Does NOT include reason, notes, diagnosis or any clinical data.
   */
  static composeAppointmentReminder(params: ComposeAppointmentReminderParams): string {
    const formattedDate = TimezoneUtil.formatShortLocalDate(params.startAt, params.timeZone);
    const formattedTime = TimezoneUtil.formatLocalTime(params.startAt, params.timeZone);

    return `Hola, ${params.patientFirstName}. Te recordamos tu cita en ${params.clinicName} el ${formattedDate} a las ${formattedTime}. Si necesitas realizar algún cambio, comunícate con la clínica.`;
  }

  /**
   * Composes a daily agenda message for clinic staff.
   * STRICT PRIVACY: Uses only patient first name and last name initial. No clinical notes or contacts.
   */
  static composeDailyAgenda(params: ComposeDailyAgendaParams): string {
    const formattedDate = TimezoneUtil.formatShortLocalDate(params.date, params.timeZone);
    const header = `Agenda de hoy — ${formattedDate}`;

    if (!params.appointments || params.appointments.length === 0) {
      return `${header}\n\nNo hay citas programadas para el día de hoy.`;
    }

    const lines = params.appointments.map((item) => {
      const timeStr = TimezoneUtil.formatLocalTime24h(item.startAt, params.timeZone);
      const lastNameInitial = item.patientLastName?.trim()
        ? ` ${item.patientLastName.trim().charAt(0).toUpperCase()}.`
        : '';
      return `${timeStr} — ${item.patientFirstName.trim()}${lastNameInitial}`;
    });

    return `${header}\n\n${lines.join('\n')}`;
  }
}
