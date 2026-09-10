import { z } from 'zod';
import { Prisma } from '../../../generated/prisma';
import { moneySchema } from '../../treatment-plans/domain/TreatmentSchema';

export const EXPIRY_WARNING_DAYS = 30;
export const movementLabels = { ENTRY: 'Entrada', CONSUMPTION: 'Consumo', WASTE: 'Merma', ADJUSTMENT_IN: 'Ajuste +', ADJUSTMENT_OUT: 'Ajuste -' } as const;
export const addsStock = (type: string) => type === 'ENTRY' || type === 'ADJUSTMENT_IN';
export const quantitySchema = z.string().regex(/^\d{1,11}(\.\d{1,3})?$/, 'Usa una cantidad con hasta tres decimales');
const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }, 'Fecha inválida');
export const productSchema = z.object({ name: z.string().trim().min(1).max(200), description: optionalText(2000), category: z.string().trim().min(1).max(100), unit: z.string().trim().min(1).max(50), minimumStock: quantitySchema.default('0'), supplierId: z.string().uuid().nullable().default(null), referenceCost: moneySchema.nullable().default(null), active: z.boolean().default(true) }).strict();
export const productUpdateSchema = productSchema.extend({ expectedVersion: z.number().int().positive() });
export const supplierSchema = z.object({ name: z.string().trim().min(1).max(200), contact: optionalText(200), phone: optionalText(50), email: z.string().email().max(254).nullable().default(null), notes: optionalText(2000), active: z.boolean().default(true) }).strict();
export const supplierUpdateSchema = supplierSchema.extend({ expectedVersion: z.number().int().positive() });
export const movementSchema = z.object({
  type: z.enum(['ENTRY', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: quantitySchema.refine(v => /[1-9]/.test(v), 'La cantidad debe ser mayor a cero'),
  lotId: z.string().uuid().nullable().default(null), number: optionalText(100), expiryDate: date.nullable().default(null),
  supplierId: z.string().uuid().nullable().default(null), unitCost: moneySchema.nullable().default(null), effectiveDate: date,
  reason: z.string().trim().max(500).default(''), note: optionalText(2000),
}).strict().superRefine((v, ctx) => {
  if (['WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(v.type) && !v.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Indica el motivo' });
  if (!addsStock(v.type) && !v.lotId) ctx.addIssue({ code: 'custom', path: ['lotId'], message: 'Selecciona la existencia o lote' });
  if (v.type === 'ENTRY' && v.lotId) ctx.addIssue({ code: 'custom', path: ['lotId'], message: 'Cada entrada registra una nueva recepción' });
  if ((!addsStock(v.type) || v.lotId) && (v.number || v.expiryDate || v.supplierId || v.unitCost)) ctx.addIssue({ code: 'custom', message: 'Los datos de recepción solo corresponden a una nueva existencia' });
});
export function clinicDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(t => parts.find(p => p.type === t)!.value).join('-');
}
export function expiryState(expiry: Date | null, today: string) {
  if (!expiry) return { expiryStatus: 'NORMAL', daysToExpiry: null, expiryLabel: null };
  const days = Math.round((Date.parse(expiry.toISOString().slice(0, 10)) - Date.parse(today)) / 86400000);
  return { expiryStatus: days < 0 ? 'EXPIRED' : days <= EXPIRY_WARNING_DAYS ? 'EXPIRING' : 'NORMAL', daysToExpiry: days,
    expiryLabel: days < 0 ? `Caducado hace ${-days} días` : days === 0 ? 'Caduca hoy' : `Caduca en ${days} días` };
}
export function stockState(stock: Prisma.Decimal, minimum: Prisma.Decimal) { return stock.eq(0) ? 'EMPTY' : stock.lt(minimum) ? 'LOW' : 'NORMAL'; }
export function balance(movements: Array<{ type: string; quantity: Prisma.Decimal }>) { return movements.reduce((sum, m) => addsStock(m.type) ? sum.plus(m.quantity) : sum.minus(m.quantity), new Prisma.Decimal(0)); }
