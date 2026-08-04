export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface AppointmentProfessionalOption {
  id: string;
  role: string;
  user: {
    firstName: string;
    lastName: string;
  };
}

export interface CreateAppointmentInput {
  patientId: string;
  professionalMembershipId: string;
  startAt: string;
  endAt: string;
  reason?: string;
  administrativeNotes?: string;
}

export interface UpdateAppointmentInput {
  professionalMembershipId?: string;
  startAt?: string;
  endAt?: string;
  reason?: string | null;
  administrativeNotes?: string | null;
}

export interface UpdateAppointmentStatusInput {
  status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW';
}

export interface CancelAppointmentInput {
  cancellationReason?: string;
}

export interface AppointmentListItem {
  id: string;
  patientId: string;
  professionalMembershipId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  reason: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    secondLastName: string | null;
  };
  professionalMembership: {
    id: string;
    role: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
}

export interface AppointmentDetail {
  id: string;
  clinicId: string;
  patientId: string;
  professionalMembershipId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  reason: string | null;
  administrativeNotes: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdByMembershipId: string;
  updatedByMembershipId: string;
  cancelledAt: string | null;
  cancelledByMembershipId: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    secondLastName: string | null;
    phone: string | null;
    email: string | null;
    status: string;
  };
  professionalMembership: {
    id: string;
    role: string;
    status: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

export interface AppointmentsFilters {
  startAt: string;
  endAt: string;
  professionalMembershipId?: string;
  status?: AppointmentStatus;
}
