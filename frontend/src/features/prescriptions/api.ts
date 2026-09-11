import { apiClient } from '../../core/api/client';
import type { Prescription, PrescriptionItem, PrescriberProfile, ProfessionalFields } from './types';
const base = '/prescriptions';
const path = (patient: string, id?: string) => `${base}/patients/${patient}${id ? `/${id}` : ''}`;
export const prescriptionsApi = {
  list: (p: string) => apiClient.get<Prescription[]>(path(p)),
  get: (p: string, id: string) => apiClient.get<Prescription>(path(p, id)),
  profile: () => apiClient.get<PrescriberProfile>(`${base}/profile`),
  saveProfile: (data: ProfessionalFields) => apiClient.patch(`${base}/profile`, data),
  save: (p: string, data: { items: PrescriptionItem[]; generalInstructions: string; encounterId: string | null; expectedVersion?: number }, id?: string) => id ? apiClient.patch<Prescription>(path(p, id), data) : apiClient.post<Prescription>(path(p), data),
  issue: (p: string, r: Prescription) => apiClient.post<Prescription>(`${path(p, r.id)}/issue`, { expectedVersion: r.version }),
  cancel: (p: string, r: Prescription, reason: string) => apiClient.post<Prescription>(`${path(p, r.id)}/cancel`, { expectedVersion: r.version, reason }),
};
