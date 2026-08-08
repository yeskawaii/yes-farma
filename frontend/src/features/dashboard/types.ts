export interface DashboardTodaySummary {
  appointmentsTotal: number;
  appointmentsUpcoming: number;
  appointmentsInProgress: number;
  appointmentsCompleted: number;
  appointmentsCancelled: number;
  appointmentsNoShow: number;
}

export interface DashboardWeekSummary {
  appointmentsTotal: number;
  appointmentsCompleted: number;
  appointmentsCancelled: number;
  appointmentsNoShow: number;
  patientsSeen: number;
  scheduledMinutes: number;
}

export interface DashboardUpcomingAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status:
    | "SCHEDULED"
    | "CONFIRMED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED"
    | "NO_SHOW";
  patient: {
    id: string;
    displayName: string;
  };
  professional: {
    membershipId: string;
    displayName: string;
  };
}

export interface BaseDashboardResponse {
  generatedAt: string;
  timeZone: string;
  today: DashboardTodaySummary;
  upcomingAppointments: DashboardUpcomingAppointment[];
  week: DashboardWeekSummary;
}

export interface ProfessionalDashboardResponse extends BaseDashboardResponse {
  scope: 'PERSONAL';
  pending: {
    draftClinicalEncounters: number;
  };
}

export interface OwnerDashboardResponse extends BaseDashboardResponse {
  scope: 'CLINIC';
  patients: {
    activeTotal: number;
  };
}

export interface AssistantDashboardResponse extends BaseDashboardResponse {
  scope: 'CLINIC_ADMIN';
  patients: {
    activeTotal: number;
  };
}

export type DashboardResponse =
  | ProfessionalDashboardResponse
  | OwnerDashboardResponse
  | AssistantDashboardResponse;
