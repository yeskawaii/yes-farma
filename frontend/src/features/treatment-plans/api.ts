import { apiClient } from '../../core/api/client';
import type { Procedure, Treatment, TreatmentInput, TreatmentPlan, Budget, BudgetStatus } from './types';
export const treatmentApi = {
  list: (patientId: string) => apiClient.get<TreatmentPlan>(`/patients/${patientId}/treatment-plan`),
  catalog: () => apiClient.get<Procedure[]>('/dental-procedures'),
  saveProcedure: (data: Omit<Procedure, 'id' | 'version'>, item?: Procedure) => item
    ? apiClient.patch<Procedure>(`/dental-procedures/${item.id}`, { ...data, expectedVersion: item.version })
    : apiClient.post<Procedure>('/dental-procedures', data),
  save: (patientId: string, data: TreatmentInput, item?: Treatment) => item
    ? apiClient.patch<Treatment>(`/patients/${patientId}/treatments/${item.id}`, { ...data, expectedVersion: item.version })
    : apiClient.post<Treatment>(`/patients/${patientId}/treatments`, data),
  budget: (patientId: string, treatmentIds: string[], discount: string) => apiClient.post<Budget>(`/patients/${patientId}/budgets`, { treatmentIds, discount }),
  budgetStatus: (patientId: string, item: Budget, status: BudgetStatus) => apiClient.patch<Budget>(`/patients/${patientId}/budgets/${item.id}`, { status, expectedVersion: item.version }),
};
