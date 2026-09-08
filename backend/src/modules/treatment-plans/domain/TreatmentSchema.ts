import { z } from 'zod';
import { toothSurfaceSchema } from '../../odontogram/domain/OdontogramSchema';
import { isAnteriorTooth, isPosteriorTooth, isValidPermanentFdiTooth } from '../../odontogram/domain/fdiConstants';

// Money travels as decimal strings; all arithmetic uses integer cents.
export const moneySchema = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Importe inválido; usa hasta dos decimales');
export const cents = (value: string | { toString(): string }) => {
  const [whole, fraction = ''] = value.toString().split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};
export const money = (value: number) => (value / 100).toFixed(2);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Fecha inválida').nullable();
export const treatmentStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const budgetStatusSchema = z.enum(['DRAFT', 'PRESENTED', 'ACCEPTED', 'REJECTED']);
export const procedureSchema = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullable().default(null),
  defaultPrice: moneySchema, active: z.boolean().default(true),
}).strict();
export const procedureUpdateSchema = procedureSchema.extend({ expectedVersion: z.number().int().positive() });
const treatmentFields = z.object({
  procedureId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullable().default(null),
  price: moneySchema, toothNumber: z.number().int().refine(isValidPermanentFdiTooth, 'Pieza FDI inválida').nullable().default(null),
  surfaces: z.array(toothSurfaceSchema).max(7).default([]), status: treatmentStatusSchema.default('PENDING'),
  plannedAt: date.default(null), completedAt: date.default(null), notes: z.string().trim().max(2000).nullable().default(null),
  professionalMembershipId: z.string().uuid().nullable().default(null),
}).strict();
function dentalRules(data: z.infer<typeof treatmentFields>, ctx: z.RefinementCtx) {
  const s = data.surfaces;
  if ((!data.toothNumber && s.length) || new Set(s).size !== s.length || (s.includes('WHOLE_TOOTH') && s.length !== 1) ||
      (data.toothNumber && ((isAnteriorTooth(data.toothNumber) && s.includes('OCCLUSAL')) || (isPosteriorTooth(data.toothNumber) && s.includes('INCISAL'))))) {
    ctx.addIssue({ code: 'custom', path: ['surfaces'], message: 'Superficies incompatibles con la pieza dental' });
  }
  if (data.completedAt && data.status !== 'COMPLETED') ctx.addIssue({ code: 'custom', path: ['completedAt'], message: 'La fecha de realización requiere estado realizado' });
}
export const treatmentSchema = treatmentFields.superRefine(dentalRules);
export const treatmentUpdateSchema = treatmentFields.extend({ expectedVersion: z.number().int().positive() }).superRefine(dentalRules);
export const budgetSchema = z.object({
  treatmentIds: z.array(z.string().uuid()).min(1).max(100).refine(v => new Set(v).size === v.length, 'Tratamientos duplicados'),
  discount: moneySchema.default('0'),
}).strict();
export const budgetUpdateSchema = z.object({ status: budgetStatusSchema, expectedVersion: z.number().int().positive() }).strict();
export function treatmentTotals(items: Array<{ price: { toString(): string }; status: string }>) {
  const sum = (statuses: string[]) => money(items.filter(i => statuses.includes(i.status)).reduce((a, i) => a + cents(i.price), 0));
  return { planned: sum(['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED']), accepted: sum(['ACCEPTED', 'IN_PROGRESS', 'COMPLETED']), completed: sum(['COMPLETED']), pending: sum(['PENDING', 'ACCEPTED', 'IN_PROGRESS']) };
}

export const paymentSchema = z.object({
  amount: moneySchema.refine(v => cents(v) > 0, 'El monto debe ser mayor a cero'),
  method: z.enum(['CASH', 'TRANSFER', 'CARD', 'OTHER']),
  paidAt: date.unwrap(),
  reference: z.string().trim().max(200).nullable().default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
}).strict();
export const paymentCancellationSchema = z.object({ cancellationReason: z.string().trim().min(1, 'Indica el motivo de cancelación').max(500) }).strict();
export function budgetFinances(total: { toString(): string }, payments: Array<{ amount: { toString(): string }; status: string }>) {
  const paid = payments.filter(p => p.status === 'ACTIVE').reduce((sum, p) => sum + cents(p.amount), 0);
  const balance = cents(total) - paid;
  return { paid: money(paid), balance: money(balance), financialStatus: balance === 0 ? 'PAID' : paid === 0 ? 'UNPAID' : 'PARTIAL' };
}
