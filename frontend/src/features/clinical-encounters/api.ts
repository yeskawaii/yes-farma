import { apiClient, ApiClientError } from '../../core/api/client';
import type {
  CreateClinicalEncounterInput,
  ClinicalEncounterCreateResponse,
  ClinicalEncounterDetail,
  ClinicalEncounterListItem,
  UpdateClinicalEncounterInput,
  ClinicalEncountersFilters
} from './types';

export function isApiError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export const clinicalEncountersApi = {
  createClinicalEncounter: async (data: CreateClinicalEncounterInput): Promise<ClinicalEncounterCreateResponse> => {
    return apiClient.post<ClinicalEncounterCreateResponse>('/clinical-encounters', data);
  },

  listClinicalEncounters: async (filters: ClinicalEncountersFilters): Promise<ClinicalEncounterListItem[]> => {
    const params = new URLSearchParams();
    params.append('patientId', filters.patientId);

    if (filters.page !== undefined) {
      params.append('page', filters.page.toString());
    }

    if (filters.pageSize !== undefined) {
      params.append('pageSize', filters.pageSize.toString());
    }

    return apiClient.get<ClinicalEncounterListItem[]>(`/clinical-encounters?${params.toString()}`);
  },

  getClinicalEncounter: async (id: string): Promise<ClinicalEncounterDetail> => {
    return apiClient.get<ClinicalEncounterDetail>(`/clinical-encounters/${id}`);
  },

  updateClinicalEncounter: async (id: string, data: UpdateClinicalEncounterInput): Promise<ClinicalEncounterDetail> => {
    return apiClient.patch<ClinicalEncounterDetail>(`/clinical-encounters/${id}`, data);
  },

  finalizeClinicalEncounter: async (id: string, data: { version: number }): Promise<ClinicalEncounterDetail> => {
    return apiClient.post<ClinicalEncounterDetail>(`/clinical-encounters/${id}/finalize`, data);
  },

  addClinicalEncounterAmendment: async (
    id: string,
    data: { version: number; reason: string; note: string }
  ): Promise<ClinicalEncounterDetail> => {
    return apiClient.post<ClinicalEncounterDetail>(`/clinical-encounters/${id}/amendments`, data);
  }
};
