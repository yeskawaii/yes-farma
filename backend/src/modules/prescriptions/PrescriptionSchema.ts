import { z } from 'zod';
const text = (max: number) => z.string().trim().max(max).default('');
export const itemSchema = z.object({ medication: text(200), brand: text(200), concentration: text(100), form: text(100), dose: text(200), route: text(100), frequency: text(200), duration: text(200), quantity: text(100), instructions: text(1000) }).strict();
export const draftSchema = z.object({ encounterId: z.string().uuid().nullable().optional(), generalInstructions: text(4000), items: z.array(itemSchema).max(30), expectedVersion: z.number().int().positive().optional() }).strict();
export const versionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const cancelSchema = versionSchema.extend({ reason: z.string().trim().min(3).max(500) });
export const profileSchema = z.object({ professionalLicense: z.string().trim().min(1).max(100), specialtyCode: text(100), specialtyLicense: text(100), professionalAddress: z.string().trim().min(1).max(500), professionalPhone: text(50) }).strict();
export function completeItems(items: z.infer<typeof itemSchema>[]) {
  return items.length > 0 && items.every(i => ['medication', 'concentration', 'form', 'dose', 'route', 'frequency', 'duration', 'quantity'].every(k => i[k as keyof typeof i].trim()));
}
