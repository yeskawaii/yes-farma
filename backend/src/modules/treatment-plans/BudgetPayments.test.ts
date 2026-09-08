import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TreatmentService } from './application/TreatmentService';
import { paymentSchema, budgetFinances } from './domain/TreatmentSchema';
import { PrismaClient, Prisma } from '../../generated/prisma';
const ctx = { clinicId: randomUUID(), membershipId: randomUUID(), userId: randomUUID(), sessionId: randomUUID(), role: 'OWNER' };
const patientId = randomUUID(); const id = randomUUID();
const input = { amount: '40.10', method: 'CASH', paidAt: '2026-09-08' };
function fixture() {
  const payments: any[] = []; const audits: any[] = [];
  const budget = { id, clinicId: ctx.clinicId, patientId, total: '100.30', status: 'ACCEPTED', payments, items: [{ price: '120.30' }] };
  const matches = (row: any, where: any) => Object.entries(where).every(([k,v]) => row[k] === v);
  const tx: any = {
    membership: { findFirst: async ({where}: any) => where.clinicId === ctx.clinicId && where.id === ctx.membershipId ? {} : null },
    patient: { findFirst: async ({where}: any) => matches({ id: patientId, clinicId: ctx.clinicId },where) ? { status: 'ACTIVE' } : null },
    treatmentBudget: { findFirst: async ({where}: any) => matches(budget,where) ? budget : null, update: async () => budget },
    budgetPayment: { create: async ({data}: any) => { const p = { id: randomUUID(), status: 'ACTIVE', ...data }; payments.push(p); return p; }, update: async ({where,data}: any) => Object.assign(payments.find(p => p.id === where.id),data) },
    auditEvent: { create: async ({data}: any) => {audits.push(data); return data;} },
  };
  return { budget, payments, audits, service: new TreatmentService({ $transaction: async (fn: any, options: any) => { assert.equal(options.isolationLevel,'Serializable'); return fn(tx); } } as PrismaClient) };
}
for (const amount of ['0','-1','NaN','Infinity','0.001','1e2','','10000000000',NaN,Infinity,1]) test(`reject invalid payment amount ${String(amount)}`, () => assert.equal(paymentSchema.safeParse({...input,amount}).success,false));
test('strict payment payload prevents association and total tampering; dates are real', () => {
  for (const field of ['clinicId','patientId','budgetId','total','paid','balance','status','createdByMembershipId']) assert.equal(paymentSchema.safeParse({...input,[field]:id}).success,false);
  assert.equal(paymentSchema.safeParse({...input,paidAt:'2026-02-30'}).success,false);
});
test('partial, multiple and complete payments derive exact totals; cancellation restores balance and retains snapshot', async () => {
  const f=fixture(); const p=await f.service.createPayment(ctx,patientId,id,input);
  assert.deepEqual(budgetFinances(f.budget.total,f.payments),{paid:'40.10',balance:'60.20',financialStatus:'PARTIAL'});
  await f.service.createPayment(ctx,patientId,id,{...input,amount:'60.20'});
  assert.deepEqual(budgetFinances(f.budget.total,f.payments),{paid:'100.30',balance:'0.00',financialStatus:'PAID'});
  await assert.rejects(f.service.createPayment(ctx,patientId,id,{...input,amount:'0.01'}),{code:'OVERPAYMENT'});
  await f.service.cancelPayment(ctx,patientId,id,p.id,{cancellationReason:'Captura duplicada'});
  assert.equal(p.amount,'40.10'); assert.equal(p.createdByMembershipId,ctx.membershipId); assert.ok(p.cancelledAt); assert.equal(p.cancelledByMembershipId,ctx.membershipId);
  assert.equal(budgetFinances(f.budget.total,f.payments).balance,'40.10');
  await assert.rejects(f.service.cancelPayment(ctx,patientId,id,p.id,{cancellationReason:'Otra vez'}),{code:'PAYMENT_CANCELLED'});
  assert.equal(f.payments.length,2); assert.equal(f.budget.items[0]?.price,'120.30');
  assert.deepEqual(f.audits.map(a=>a.action),['PAYMENT_CREATED','PAYMENT_CREATED','PAYMENT_CANCELLED']);
});
test('overpayment and nonaccepted budgets rejected',async()=>{ const f=fixture(); await assert.rejects(f.service.createPayment(ctx,patientId,id,{...input,amount:'100.31'}),{code:'OVERPAYMENT'}); for(const status of ['DRAFT','PRESENTED','REJECTED']){f.budget.status=status;await assert.rejects(f.service.createPayment(ctx,patientId,id,input),{code:'INVALID_BUDGET_STATUS'});} });
test('read, create, cancel and print enforce clinic, membership, patient and budget scope',async()=>{
 const f=fixture(); const p=await f.service.createPayment(ctx,patientId,id,input);
 for(const [context,patient,budget,code] of [[{...ctx,clinicId:randomUUID()},patientId,id,'FORBIDDEN'],[{...ctx,membershipId:randomUUID()},patientId,id,'FORBIDDEN'],[ctx,randomUUID(),id,'NOT_FOUND'],[ctx,patientId,randomUUID(),'NOT_FOUND']] as const){
  await assert.rejects(f.service.paymentHistory(context,patient,budget),{code}); await assert.rejects(f.service.createPayment(context,patient,budget,input),{code}); await assert.rejects(f.service.cancelPayment(context,patient,budget,p.id,{cancellationReason:'Error'}),{code}); await assert.rejects(f.service.printBudget(context,patient,budget),{code});
 }
 await assert.rejects(f.service.cancelPayment(ctx,patientId,id,randomUUID(),{cancellationReason:'Error'}),{code:'NOT_FOUND'});
 assert.throws(()=>f.service.cancelPayment(ctx,patientId,id,p.id,{cancellationReason:'  '}));
});
test('serialization conflicts become explicit retryable 409',async()=>{
 const service=new TreatmentService({$transaction:async()=>{throw new Prisma.PrismaClientKnownRequestError('conflict',{code:'P2034',clientVersion:'7'});}} as unknown as PrismaClient);
 await assert.rejects(service.createPayment(ctx,patientId,id,input),{code:'CONCURRENCY_ERROR',statusCode:409});
});
