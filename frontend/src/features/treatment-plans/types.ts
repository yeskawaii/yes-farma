import type { ToothSurface } from '../odontogram/types';
export type TreatmentStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type BudgetStatus = 'DRAFT' | 'PRESENTED' | 'ACCEPTED' | 'REJECTED';
export interface Procedure { id: string; name: string; description: string | null; defaultPrice: string; active: boolean; version: number }
export interface TreatmentInput {
  procedureId: string | null; name: string; description: string | null; price: string; toothNumber: number | null;
  surfaces: ToothSurface[]; status: TreatmentStatus; plannedAt: string | null; completedAt: string | null;
  notes: string | null; professionalMembershipId: string | null;
}
export interface Treatment extends TreatmentInput { id: string; version: number; createdAt: string; professional?: { user: { firstName: string; lastName: string } } | null }
export interface Budget { folio?: string | null; paid?: string; balance?: string; financialStatus?: 'UNPAID' | 'PARTIAL' | 'PAID'; id: string; version: number; status: BudgetStatus; subtotal: string; discount: string; total: string; createdAt: string; items: Array<{ id: string; name: string; description: string | null; price: string; toothNumber: number | null; surfaces: ToothSurface[] }> }
export interface TreatmentPlan { treatments: Treatment[]; budgets: Budget[]; totals: { planned: string; accepted: string; completed: string; pending: string } }
export const treatmentLabels: Record<TreatmentStatus, string> = { PENDING: 'Pendiente', ACCEPTED: 'Aceptado', IN_PROGRESS: 'En proceso', COMPLETED: 'Realizado', CANCELLED: 'Cancelado' };
export const budgetLabels: Record<BudgetStatus, string> = { DRAFT: 'Borrador', PRESENTED: 'Presentado', ACCEPTED: 'Aceptado', REJECTED: 'Rechazado' };
export const formatMoney = (value: string | number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value));
