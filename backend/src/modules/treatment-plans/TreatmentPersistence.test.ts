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
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url!, max: 1 }, { schema: process.env.TREATMENT_TEST_DATABASE_SCHEMA || 'public' }) });
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
      await service.updateBudget(ctx, patient.id, budget.id, { status: 'ACCEPTED', expectedVersion: 2 });
      const payment = await service.createPayment(ctx, patient.id, budget.id, { amount: '40.05', method: 'TRANSFER', paidAt: '2026-09-08' });
      assert.equal((await service.paymentHistory(ctx, patient.id, budget.id)).balance, '60.00');
      await service.createPayment(ctx, patient.id, budget.id, { amount: '60', method: 'CASH', paidAt: '2026-09-08' });
      assert.equal((await service.paymentHistory(ctx, patient.id, budget.id)).financialStatus, 'PAID');
      await assert.rejects(service.createPayment(ctx, patient.id, budget.id, { amount: '0.01', method: 'CASH', paidAt: '2026-09-08' }), { code: 'OVERPAYMENT' });
      await service.cancelPayment(ctx, patient.id, budget.id, payment.id, { cancellationReason: 'Duplicado' });
      const history = await service.paymentHistory(ctx, patient.id, budget.id);
      assert.equal(history.balance, '40.05'); assert.equal(history.payments.length, 2);
      assert.equal(history.items[0]?.price.toString(), '123.45');
      await assert.rejects(service.cancelPayment(ctx, patient.id, budget.id, payment.id, { cancellationReason: 'Duplicado' }), { code: 'PAYMENT_CANCELLED' });
      const otherClinic = await tx.clinic.create({ data: { name: 'Other fixture' } });
      const otherMember = await tx.membership.create({ data: { clinicId: otherClinic.id, userId: user.id, role: 'OWNER', profile: { create: { specialtyCode: 'DENTAL' } } } });
      const otherPatient = await tx.patient.create({ data: { clinicId: otherClinic.id, firstName: 'Other', lastName: 'Patient', createdByMembershipId: otherMember.id, updatedByMembershipId: otherMember.id } });
      const otherCtx = { ...ctx, clinicId: otherClinic.id, membershipId: otherMember.id };
      await assert.rejects(service.paymentHistory(otherCtx, otherPatient.id, budget.id), { code: 'NOT_FOUND' });
      await assert.rejects(service.createPayment(otherCtx, otherPatient.id, budget.id, { amount: '1', method: 'CASH', paidAt: '2026-09-08' }), { code: 'NOT_FOUND' });
      await assert.rejects(service.cancelPayment(otherCtx, otherPatient.id, budget.id, payment.id, { cancellationReason: 'Error' }), { code: 'NOT_FOUND' });
      const anotherPatient = await tx.patient.create({ data: { clinicId: clinic.id, firstName: 'Same clinic', lastName: 'Other patient', createdByMembershipId: member.id, updatedByMembershipId: member.id } });
      await assert.rejects(service.paymentHistory(ctx, anotherPatient.id, budget.id), { code: 'NOT_FOUND' });
      await assert.rejects(service.cancelPayment(ctx, anotherPatient.id, budget.id, payment.id, { cancellationReason: 'Error' }), { code: 'NOT_FOUND' });
      await tx.membership.update({ where: { id: otherMember.id }, data: { role: 'ASSISTANT' } });
      await assert.rejects(service.paymentHistory(otherCtx, otherPatient.id, budget.id), { code: 'FORBIDDEN' });
      await assert.rejects(service.createPayment(otherCtx, otherPatient.id, budget.id, { amount: '1', method: 'CASH', paidAt: '2026-09-08' }), { code: 'FORBIDDEN' });
      await assert.rejects(service.cancelPayment(otherCtx, otherPatient.id, budget.id, payment.id, { cancellationReason: 'Error' }), { code: 'FORBIDDEN' });
      const document = await service.printBudget(ctx, patient.id, budget.id);
      assert.equal(document.budget.balance, '40.05'); assert.equal(document.clinic.name, clinic.name);
      throw rollback;
    }, { timeout: 30000 }), e => e === rollback);
  } finally { await db.$disconnect(); }
});

test('real concurrent payments cannot overpay the same budget', { skip: !url }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url!, max: 4 }, { schema: process.env.TREATMENT_TEST_DATABASE_SCHEMA || 'public' }) });
  try {
    const clinic = await db.clinic.create({ data: { name: 'Disposable concurrency fixture' } });
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.test`, passwordHash: 'test-only', firstName: 'Concurrent', lastName: 'Professional' } });
    const member = await db.membership.create({ data: { clinicId: clinic.id, userId: user.id, role: 'OWNER', profile: { create: { specialtyCode: 'DENTAL' } } } });
    const patient = await db.patient.create({ data: { clinicId: clinic.id, firstName: 'Concurrent', lastName: 'Patient', createdByMembershipId: member.id, updatedByMembershipId: member.id } });
    const ctx = { clinicId: clinic.id, userId: user.id, membershipId: member.id, role: 'OWNER', sessionId: randomUUID() };
    const service = new TreatmentService(db);
    const treatment = await service.saveTreatment(ctx, patient.id, { name: 'Concurrency', price: '100' });
    const budget = await service.createBudget(ctx, patient.id, { treatmentIds: [treatment.id] });
    await service.updateBudget(ctx, patient.id, budget.id, { status: 'PRESENTED', expectedVersion: 1 });
    await service.updateBudget(ctx, patient.id, budget.id, { status: 'ACCEPTED', expectedVersion: 2 });
    const results = await Promise.allSettled([1,2].map(() => service.createPayment(ctx,patient.id,budget.id,{ amount:'70', method:'CASH', paidAt:'2026-09-08' })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    assert.ok(['CONCURRENCY_ERROR','OVERPAYMENT'].includes(failed.reason.code));
    const history = await service.paymentHistory(ctx,patient.id,budget.id);
    assert.equal(history.paid,'70.00'); assert.equal(history.balance,'30.00'); assert.equal(history.payments.length,1);
    assert.equal(await db.auditEvent.count({ where: { clinicId:clinic.id, action:'PAYMENT_CREATED' } }),1);
  } finally { await db.$disconnect(); }
});
