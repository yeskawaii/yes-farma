import type { Payment } from './BudgetPayments';
import type { BudgetDocument } from './budgetPrint';
import { apiClient } from '../../core/api/client';
import type { Procedure, Treatment, TreatmentInput, TreatmentPlan, Budget, BudgetStatus } from './types';
export const treatmentApi = {
  payments: (p: string, b: string) => apiClient.get<Budget & { payments: Payment[] }>(`/patients/${p}/budgets/${b}/payments`),
  pay: (p: string, b: string, data: { amount: string; method: Payment['method']; paidAt: string; reference: string | null; notes: string | null }) => apiClient.post(`/patients/${p}/budgets/${b}/payments`, data),
  cancelPayment: (p: string, b: string, payment: string, cancellationReason: string) => apiClient.post(`/patients/${p}/budgets/${b}/payments/${payment}/cancel`, { cancellationReason }),
  print: (p: string, b: string) => apiClient.get<BudgetDocument>(`/patients/${p}/budgets/${b}/print`),
  list: (patientId: string) => apiClient.get<TreatmentPlan>(`/patients/${patientId}/treatment-plan`),
  catalog: () => apiClient.get<Procedure[]>('/dental-procedures'),
  saveProcedure: (data: Omit<Procedure, 'id' | 'version'>, item?: Procedure) => item
    ? apiClient.patch<Procedure>(`/dental-procedures/${item.id}`, { ...data, expectedVersion: item.version })
    : apiClient.post<Procedure>('/dental-procedures', data),
  save: (patientId: string, data: TreatmentInput, item?: Treatment) => item
    ? apiClient.patch<Treatment>(`/patients/${patientId}/treatments/${item.id}`, { ...data, expectedVersion: item.version })
    : apiClient.post<Treatment>(`/patients/${patientId}/treatments`, data),
  budget: (patientId: string, treatmentIds: string[], discount: string) => apiClient.post<Budget>(`/patients/${patientId}/budgets`, { treatmentIds, discount }),
  updateDiscount: (patientId: string, item: Budget, discount: string) => apiClient.patch<Budget>(`/patients/${patientId}/budgets/${item.id}`, { discount, expectedVersion: item.version }),
  budgetStatus: (patientId: string, item: Budget, status: BudgetStatus) => apiClient.patch<Budget>(`/patients/${patientId}/budgets/${item.id}`, { status, expectedVersion: item.version }),
};
