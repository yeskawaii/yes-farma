import { apiClient, ApiClientError } from '../../core/api/client';
import type { AppointmentListItem, AppointmentDetail, AppointmentsFilters, AppointmentProfessionalOption, CreateAppointmentInput, UpdateAppointmentInput, UpdateAppointmentStatusInput, CancelAppointmentInput } from './types';

export function isApiError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function getAppointmentErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    switch (error.code) {
      case 'APPOINTMENT_CONFLICT':
        return 'El profesional ya tiene una cita en ese horario.';
      case 'PATIENT_INACTIVE':
        return 'El paciente seleccionado ya no está activo.';
      case 'INVALID_PROFESSIONAL':
        return 'El profesional seleccionado no está disponible.';
      case 'FORBIDDEN':
        return 'No tienes permisos para realizar esta acción.';
      case 'APPOINTMENT_NOT_EDITABLE':
        return 'Esta cita ya no puede editarse.';
      case 'INVALID_APPOINTMENT_TRANSITION':
        return 'El cambio de estado solicitado ya no es válido.';
      case 'NOT_FOUND':
        return 'La cita ya no está disponible.';
    }

    if (error.status >= 400 && error.status < 500 && error.message && error.message !== 'Error en la petición') {
      return error.message;
    }

    return fallback;
  }

  if (error instanceof Error) {
    if (
      error.message.includes('Formato') ||
      error.message.includes('rango') ||
      error.message.includes('calendario') ||
      error.message.includes('mapear')
    ) {
      return 'No fue posible interpretar la fecha o el horario. Verifica los datos.';
    }
  }

  return fallback;
}

export const appointmentsApi = {
  list: async (filters: AppointmentsFilters): Promise<AppointmentListItem[]> => {
    const params = new URLSearchParams();
    params.append('startAt', filters.startAt);
    params.append('endAt', filters.endAt);

    if (filters.professionalMembershipId) {
      params.append('professionalMembershipId', filters.professionalMembershipId);
    }
    if (filters.status) {
      params.append('status', filters.status);
    }

    return apiClient.get<AppointmentListItem[]>(`/appointments?${params.toString()}`);
  },

  getById: async (id: string): Promise<AppointmentDetail> => {
    return apiClient.get<AppointmentDetail>(`/appointments/${id}`);
  },

  listProfessionals: async (): Promise<AppointmentProfessionalOption[]> => {
    return apiClient.get<AppointmentProfessionalOption[]>('/appointments/professionals');
  },

  create: async (data: CreateAppointmentInput): Promise<AppointmentDetail> => {
    return apiClient.post<AppointmentDetail>('/appointments', data);
  },

  update: async (id: string, data: UpdateAppointmentInput): Promise<AppointmentDetail> => {
    return apiClient.patch<AppointmentDetail>(`/appointments/${id}`, data);
  },

  updateStatus: async (id: string, data: UpdateAppointmentStatusInput): Promise<AppointmentDetail> => {
    return apiClient.patch<AppointmentDetail>(`/appointments/${id}/status`, data);
  },

  cancel: async (id: string, data: CancelAppointmentInput): Promise<AppointmentDetail> => {
    return apiClient.patch<AppointmentDetail>(`/appointments/${id}/cancel`, data);
  }
};
