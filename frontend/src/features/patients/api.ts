import { apiClient } from '../../core/api/client';
import type { PaginatedResponse, PatientListItem, PatientDetail, PatientsFilters, PatientFormInput } from './types';

export const patientsApi = {
  list: async (filters: PatientsFilters): Promise<PaginatedResponse<PatientListItem>> => {
    const params = new URLSearchParams();
    if (filters.q) params.append('q', filters.q);
    if (filters.status) params.append('status', filters.status);
    params.append('page', filters.page.toString());
    params.append('pageSize', filters.pageSize.toString());
    
    return apiClient.get<PaginatedResponse<PatientListItem>>(`/patients?${params.toString()}`);
  },
  
  getById: async (id: string): Promise<PatientDetail> => {
    return apiClient.get<PatientDetail>(`/patients/${id}`);
  },

  create: async (data: PatientFormInput): Promise<PatientDetail> => {
    return apiClient.post<PatientDetail>('/patients', data);
  },

  update: async (id: string, data: Partial<PatientFormInput>): Promise<PatientDetail> => {
    return apiClient.patch<PatientDetail>(`/patients/${id}`, data);
  },

  deactivate: async (id: string): Promise<PatientDetail> => {
    return apiClient.patch<PatientDetail>(`/patients/${id}/deactivate`);
  },

  reactivate: async (id: string): Promise<PatientDetail> => {
    return apiClient.patch<PatientDetail>(`/patients/${id}/reactivate`);
  }
};
