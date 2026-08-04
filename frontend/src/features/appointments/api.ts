import { apiClient } from '../../core/api/client';
import type { AppointmentListItem, AppointmentDetail, AppointmentsFilters } from './types';

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
  }
};
