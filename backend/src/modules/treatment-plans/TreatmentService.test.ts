import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TreatmentService } from './application/TreatmentService';
import { treatmentSchema, treatmentTotals, moneySchema, budgetSchema } from './domain/TreatmentSchema';
import { PrismaClient } from '../../generated/prisma';
import { AuthContext } from '../../middlewares/auth';

const ctx: AuthContext = { clinicId: randomUUID(), membershipId: randomUUID(), userId: randomUUID(), sessionId: randomUUID(), role: 'OWNER' };
const patientId = randomUUID();
function fixture(specialty: 'DENTISTRY' | 'PEDIATRICS' = 'DENTISTRY') {
  const rows: any[] = []; const budgets: any[] = []; const audits: any[] = [];
  let allowed = true; let active = true; let role = 'OWNER'; let profileActive = true;
  const matches = (r: any, where: any): boolean => Object.entries(where).every(([key, v]: [string, any]) => typeof v === 'object' && v !== null ? v.in ? v.in.includes(r[key]) : v.not ? r[key] !== v.not : true : r[key] === v);
  const tx: any = {
    clinic: { findUniqueOrThrow: async () => ({ clinicalSpecialty: specialty }) },
    membership: { findFirst: async ({ where }: any) => allowed && where.clinicId === ctx.clinicId && where.id === ctx.membershipId && where.role.in.includes(role) && where.profile.active === profileActive ? { id: ctx.membershipId } : null },
    patient: { findFirst: async ({ where }: any) => where.clinicId === ctx.clinicId && where.id === patientId ? { id: patientId, status: active ? 'ACTIVE' : 'INACTIVE' } : null },
    auditEvent: { create: async ({ data }: any) => { audits.push(data); return data; } },
    dentalProcedure: { findFirst: async () => null },
  };
  for (const [key, list] of [['patientTreatment', rows], ['treatmentBudget', budgets]] as const) tx[key] = {
    findMany: async ({ where }: any) => list.filter(r => matches(r, where)),
    findFirst: async ({ where }: any) => list.find(r => matches(r, where)) || null,
    findUniqueOrThrow: async ({ where }: any) => list.find(r => matches(r, where)),
    create: async ({ data }: any) => { const row = { id: randomUUID(), version: 1, status: 'DRAFT', ...data, ...(data.items ? { items: data.items.create } : {}) }; list.push(row); return row; },
    updateMany: async ({ where, data }: any) => { const row = list.find(r => matches(r, where)); if (!row) return { count: 0 }; Object.assign(row, data, { version: row.version + 1 }); return { count: 1 }; },
  };
  const service = new TreatmentService({ $transaction: async (fn: any) => fn(tx) } as unknown as PrismaClient);
  return { service, rows, budgets, audits, setRole: (value: string) => { role = value; }, disableProfile: () => { profileActive = false; }, deny: () => { allowed = false; }, deactivate: () => { active = false; } };
}
const input = { name: 'Resina', price: '123.45', toothNumber: 16, surfaces: ['OCCLUSAL'] };

test('creates treatment associated with patient, FDI tooth and audit', async () => {
  const f = fixture(); const item = await f.service.saveTreatment(ctx, patientId, input);
  assert.equal(item.patientId, patientId); assert.equal(item.clinicId, ctx.clinicId); assert.equal(item.toothNumber, 16); assert.equal(item.status, 'PENDING'); assert.equal(f.audits.length, 1);
});
test('edits treatment, changes state, preserves row and rejects stale version', async () => {
  const f = fixture(); const item = await f.service.saveTreatment(ctx, patientId, input);
  const changed = await f.service.saveTreatment(ctx, patientId, { ...input, price: '150.50', status: 'COMPLETED', completedAt: '2026-09-07', expectedVersion: 1 }, item.id);
  assert.equal(changed.status, 'COMPLETED'); assert.equal(changed.price, '150.50'); assert.equal(changed.version, 2);
  await assert.rejects(f.service.saveTreatment(ctx, patientId, { ...input, expectedVersion: 1 }, item.id), { code: 'CONCURRENCY_ERROR' });
  await f.service.saveTreatment(ctx, patientId, { ...input, status: 'CANCELLED', expectedVersion: 2 }, item.id);
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0].status, 'CANCELLED');
});
test('rejects wrong patient, clinic, professional and catalog references', async () => {
  const f = fixture(); const item = await f.service.saveTreatment(ctx, patientId, input);
  await assert.rejects(f.service.saveTreatment(ctx, randomUUID(), { ...input, expectedVersion: 1 }, item.id), { code: 'NOT_FOUND' });
  await assert.rejects(f.service.list({ ...ctx, clinicId: randomUUID() }, patientId), { code: 'FORBIDDEN' });
  await assert.rejects(f.service.saveTreatment(ctx, patientId, { ...input, professionalMembershipId: randomUUID() }), { code: 'INVALID_PROFESSIONAL' });
  await assert.rejects(f.service.saveTreatment(ctx, patientId, { ...input, procedureId: randomUUID() }), { code: 'VALIDATION_ERROR' });
});
test('clinical access requires eligible membership/profile; inactive patient remains readable', async () => {
  const f = fixture(); f.deny();
  await assert.rejects(f.service.list(ctx, patientId), { code: 'FORBIDDEN' });
  await assert.rejects(f.service.saveTreatment(ctx, patientId, input), { code: 'FORBIDDEN' });
  const g = fixture(); g.deactivate(); await g.service.list(ctx, patientId);
  await assert.rejects(g.service.saveTreatment(ctx, patientId, input), { code: 'PATIENT_INACTIVE' });
});
test('money and dental/date/state validation reject invalid inputs', () => {
  for (const price of ['-1', 'NaN', '1.234', '1e3', '', '10000000000']) assert.equal(moneySchema.safeParse(price).success, false);
  for (const invalid of [{ toothNumber: 19 }, { toothNumber: 11 }, { toothNumber: null }, { surfaces: ['WHOLE_TOOTH', 'MESIAL'] }, { surfaces: ['MESIAL', 'MESIAL'] }, { status: 'OTHER' }, { plannedAt: '2026-02-30' }, { completedAt: '2026-09-07' }]) assert.equal(treatmentSchema.safeParse({ ...input, ...invalid }).success, false);
  assert.equal(treatmentSchema.safeParse({ name: 'Limpieza', price: '0' }).success, true);
});
test('totals use exact cents, exclude cancellations and include ongoing accepted care', () => {
  const totals = treatmentTotals([{ price: '0.10', status: 'PENDING' }, { price: '0.20', status: 'ACCEPTED' }, { price: '10.30', status: 'IN_PROGRESS' }, { price: '20.40', status: 'COMPLETED' }, { price: '100', status: 'CANCELLED' }]);
  assert.deepEqual(totals, { planned: '31.00', accepted: '30.90', completed: '20.40', pending: '10.60' });
});
test('budget snapshots, discount, statuses, and invalid selections', async () => {
  const f = fixture(); const item = await f.service.saveTreatment(ctx, patientId, input);
  const b = await f.service.createBudget(ctx, patientId, { treatmentIds: [item.id], discount: '23.40' });
  assert.equal(b.total, '100.05'); assert.equal(b.items[0]?.price, '123.45');
  await f.service.saveTreatment(ctx, patientId, { ...input, price: '200', expectedVersion: 1 }, item.id);
  assert.equal(b.items[0]?.price, '123.45');
  await f.service.updateBudget(ctx, patientId, b.id, { status: 'PRESENTED', expectedVersion: 1 });
  await f.service.updateBudget(ctx, patientId, b.id, { status: 'ACCEPTED', expectedVersion: 2 });
  await assert.rejects(f.service.updateBudget(ctx, patientId, b.id, { status: 'DRAFT', expectedVersion: 3 }), { code: 'INVALID_TRANSITION' });
  await assert.rejects(f.service.createBudget(ctx, patientId, { treatmentIds: [randomUUID()] }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(f.service.createBudget(ctx, patientId, { treatmentIds: [item.id], discount: '201' }), { code: 'VALIDATION_ERROR' });
  assert.equal(budgetSchema.safeParse({ treatmentIds: [item.id, item.id] }).success, false);
  await f.service.saveTreatment(ctx, patientId, { ...input, status: 'CANCELLED', expectedVersion: 2 }, item.id);
  await assert.rejects(f.service.createBudget(ctx, patientId, { treatmentIds: [item.id] }), { code: 'VALIDATION_ERROR' });
});


test('OWNER and PROFESSIONAL with active profiles are allowed; ASSISTANT and inactive profiles are denied', async () => {
  const f = fixture();
  for (const role of ['OWNER', 'PROFESSIONAL']) { f.setRole(role); await f.service.list({ ...ctx, role }, patientId); }
  f.setRole('ASSISTANT');
  await assert.rejects(f.service.list({ ...ctx, role: 'ASSISTANT' }, patientId), { code: 'FORBIDDEN' });
  await assert.rejects(f.service.createBudget(ctx, patientId, { treatmentIds: [randomUUID()] }), { code: 'FORBIDDEN' });
  f.setRole('OWNER'); f.disableProfile();
  await assert.rejects(f.service.saveTreatment(ctx, patientId, input), { code: 'FORBIDDEN' });
});

test('discount corrections preserve snapshot, identity, state and audit; reject stale versions and locked budgets', async () => {
  const f = fixture(); const t = await f.service.saveTreatment(ctx, patientId, input);
  const b = await f.service.createBudget(ctx, patientId, { treatmentIds: [t.id], discount: '23.40' });
  const snapshot = JSON.stringify(b.items);
  await f.service.updateBudget(ctx, patientId, b.id, { discount: '3.40', expectedVersion: 1 });
  assert.equal(b.total, '120.05'); assert.equal(b.status, 'DRAFT'); assert.equal(JSON.stringify(b.items), snapshot);
  assert.deepEqual(f.audits.at(-1).metadata, { before: { discount: '23.40', total: '100.05' }, after: { discount: '3.40', total: '120.05' } });
  await assert.rejects(f.service.updateBudget(ctx, patientId, b.id, { discount: '0', expectedVersion: 1 }), { code: 'CONCURRENCY_ERROR' });
  await assert.rejects(f.service.updateBudget(ctx, patientId, b.id, { discount: '124', expectedVersion: 2 }), { code: 'VALIDATION_ERROR' });
  for (const discount of ['-1', '1.234', 'NaN']) assert.throws(() => f.service.updateBudget(ctx, patientId, b.id, { discount, expectedVersion: 2 }));
  await f.service.updateBudget(ctx, patientId, b.id, { status: 'PRESENTED', expectedVersion: 2 });
  await f.service.updateBudget(ctx, patientId, b.id, { discount: '0', expectedVersion: 3 });
  assert.equal(b.total, '123.45'); assert.equal(b.status, 'PRESENTED'); assert.equal(f.budgets.length, 1);
  for (const status of ['ACCEPTED', 'REJECTED'] as const) {
    b.status = status;
    await assert.rejects(f.service.updateBudget(ctx, patientId, b.id, { discount: '1', expectedVersion: 4 }), { code: 'BUDGET_LOCKED' });
  }
  b.status = 'DRAFT';
  await assert.rejects(f.service.updateBudget(ctx, randomUUID(), b.id, { discount: '0', expectedVersion: 4 }), { code: 'NOT_FOUND' });
  f.deactivate();
  await assert.rejects(f.service.updateBudget(ctx, patientId, b.id, { discount: '0', expectedVersion: 4 }), { code: 'PATIENT_INACTIVE' });
});

test('Pediatrics keeps generic treatment and financial operations and rejects dental capture', async () => {
  const f = fixture('PEDIATRICS');
  await assert.rejects(f.service.saveTreatment(ctx, patientId, input), { code: 'CLINIC_CAPABILITY_DISABLED' });
  assert.equal(f.rows.length, 0);
  const treatment = await f.service.saveTreatment(ctx, patientId, { name: 'Consulta pediátrica', price: '500' });
  assert.equal(treatment.toothNumber, null);
  const budget = await f.service.createBudget(ctx, patientId, { treatmentIds: [treatment.id], discount: '50' });
  assert.equal(budget.total, '450.00');
});

test('specialty change preserves historical dental associations while permitting generic treatment edits', async () => {
  const f = fixture('PEDIATRICS');
  const id = randomUUID();
  f.rows.push({ id, clinicId: ctx.clinicId, patientId, version: 1, toothNumber: 16, surfaces: ['OCCLUSAL'], name: 'Registro previo', price: '100', status: 'PENDING' });
  const updated = await f.service.saveTreatment(ctx, patientId, { ...input, name: 'Seguimiento', expectedVersion: 1 }, id);
  assert.equal(updated.toothNumber, 16); assert.deepEqual(updated.surfaces, ['OCCLUSAL']);
  await assert.rejects(f.service.saveTreatment(ctx, patientId, { ...input, toothNumber: null, surfaces: [], expectedVersion: 2 }, id), { code: 'CLINIC_CAPABILITY_DISABLED' });
  await assert.rejects(f.service.saveTreatment(ctx, patientId, { ...input, toothNumber: 26, expectedVersion: 2 }, id), { code: 'CLINIC_CAPABILITY_DISABLED' });
});
