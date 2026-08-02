import { apiClient } from '../../core/api/client';
import type { PaginatedResponse, PatientListItem, PatientDetail, PatientsFilters } from './types';

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
  }
};
