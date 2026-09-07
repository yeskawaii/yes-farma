import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../../generated/prisma';
import { TreatmentService } from './application/TreatmentService';

// Explicit opt-in: use a disposable PostgreSQL database with migrations applied.
// Fixtures are rolled back; the default suite never connects to a real database.
const url = process.env.TREATMENT_TEST_DATABASE_URL;
test('Prisma persistence: catalog, treatment, budget snapshots, audit and patient associations', { skip: !url }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url!, max: 1 }) });
  const rollback = new Error('ROLLBACK_TEST_FIXTURES');
  try {
    await assert.rejects(db.$transaction(async tx => {
      const clinic = await tx.clinic.create({ data: { name: 'Treatment test fixture' } });
      const user = await tx.user.create({ data: { email: `${randomUUID()}@example.test`, passwordHash: 'test-only', firstName: 'Fixture', lastName: 'Professional' } });
      const member = await tx.membership.create({ data: { clinicId: clinic.id, userId: user.id, role: 'OWNER', profile: { create: { specialtyCode: 'DENTAL' } } } });
      const patient = await tx.patient.create({ data: { clinicId: clinic.id, firstName: 'Fixture', lastName: 'Patient', createdByMembershipId: member.id, updatedByMembershipId: member.id } });
      const ctx = { clinicId: clinic.id, userId: user.id, membershipId: member.id, role: 'OWNER', sessionId: randomUUID() };
      const service = new TreatmentService({ $transaction: <T>(fn: (transaction: Prisma.TransactionClient) => Promise<T>) => fn(tx) } as unknown as PrismaClient);
      const procedure = await service.saveProcedure(ctx, { name: 'Fixture procedure', defaultPrice: '123.45' });
      const input = { procedureId: procedure.id, name: procedure.name, price: '123.45', toothNumber: 16, surfaces: ['OCCLUSAL'], professionalMembershipId: member.id };
      const treatment = await service.saveTreatment(ctx, patient.id, input);
      const budget = await service.createBudget(ctx, patient.id, { treatmentIds: [treatment.id], discount: '23.40' });
      assert.equal(budget.total.toString(), '100.05');
      assert.equal(budget.items[0]?.patientId, patient.id);
      assert.equal(budget.items[0]?.clinicId, clinic.id);
      await service.saveTreatment(ctx, patient.id, { ...input, price: '200', status: 'COMPLETED', expectedVersion: 1 }, treatment.id);
      await service.updateBudget(ctx, patient.id, budget.id, { status: 'PRESENTED', expectedVersion: 1 });
      const plan = await service.list(ctx, patient.id);
      assert.equal(plan.totals.completed, '200.00');
      assert.equal(plan.budgets[0]?.items[0]?.price.toString(), '123.45');
      assert.equal(await tx.auditEvent.count({ where: { clinicId: clinic.id } }), 5);
      throw rollback;
    }, { timeout: 30000 }), e => e === rollback);
  } finally { await db.$disconnect(); }
});
