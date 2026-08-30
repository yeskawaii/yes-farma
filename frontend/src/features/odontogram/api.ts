import { apiClient } from '../../core/api/client';
import type {
  OdontogramResponse,
  ToothDetailResponse,
  DentalFindingItem,
  CreateDentalFindingInput,
  ResolveDentalFindingInput,
  CancelDentalFindingInput,
  BatchOdontogramActionInput,
  BatchOdontogramResponse
} from './types';

export const odontogramApi = {
  getOdontogram: async (patientId: string): Promise<OdontogramResponse> => {
    return apiClient.get<OdontogramResponse>(`/patients/${patientId}/odontogram`);
  },

  getToothDetail: async (patientId: string, toothNumber: number): Promise<ToothDetailResponse> => {
    return apiClient.get<ToothDetailResponse>(`/patients/${patientId}/odontogram/teeth/${toothNumber}`);
  },

  createFinding: async (patientId: string, input: CreateDentalFindingInput): Promise<DentalFindingItem> => {
    return apiClient.post<DentalFindingItem>(`/patients/${patientId}/odontogram/findings`, input);
  },

  applyBatch: async (
    patientId: string,
    input: BatchOdontogramActionInput
  ): Promise<BatchOdontogramResponse> => {
    return apiClient.post<BatchOdontogramResponse>(`/patients/${patientId}/odontogram/batch`, input);
  },

  resolveFinding: async (
    patientId: string,
    findingId: string,
    input: ResolveDentalFindingInput
  ): Promise<DentalFindingItem> => {
    return apiClient.post<DentalFindingItem>(
      `/patients/${patientId}/odontogram/findings/${findingId}/resolve`,
      input
    );
  },

  cancelFinding: async (
    patientId: string,
    findingId: string,
    input: CancelDentalFindingInput
  ): Promise<DentalFindingItem> => {
    return apiClient.post<DentalFindingItem>(
      `/patients/${patientId}/odontogram/findings/${findingId}/cancel`,
      input
    );
  }
};
