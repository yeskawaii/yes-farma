import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, MembershipRole, Prisma } from '../../generated/prisma';
import { InventoryService } from './application/InventoryService';
import { AuthContext } from '../../middlewares/auth';

// Explicit opt-in, never falls back to application DATABASE_URL. Fixtures remain only in disposable DB.
const url = process.env.INVENTORY_TEST_DATABASE_URL;
const schema = process.env.INVENTORY_TEST_DATABASE_SCHEMA || 'public';
function client() { if (url) { const target = new URL(url); assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname) && target.pathname === '/inventory_test', 'Inventory tests require a disposable local inventory_test DB'); } return new PrismaClient({ adapter: new PrismaPg({ connectionString: url!, max: 8 }, { schema }) }); }
async function fixture(db: PrismaClient, role: MembershipRole = 'OWNER', clinicId?: string): Promise<AuthContext> {
  const clinic = clinicId || (await db.clinic.create({ data: { name: 'Disposable inventory fixture' } })).id;
  const user = await db.user.create({ data: { email: `${randomUUID()}@example.test`, passwordHash: 'test-only', firstName: role, lastName: 'Fixture' } });
  const member = await db.membership.create({ data: { clinicId: clinic, userId: user.id, role } });
  return { clinicId: clinic, userId: user.id, membershipId: member.id, role, sessionId: randomUUID() };
}
const now = () => new Date('2026-09-10T18:00:00Z');
const productInput = { name: 'Guantes nitrilo M', category: 'Protección personal', unit: 'caja', minimumStock: '5', referenceCost: '123.45' };
const entry = { type: 'ENTRY', quantity: '10', effectiveDate: '2026-09-10' };
const editProduct = (p: { name: string; category: string; unit: string; minimumStock: { toString(): string }; version: number }) => ({ name: p.name, category: p.category, unit: p.unit, minimumStock: p.minimumStock.toString(), expectedVersion: p.version });

test('inventory persistence, permissions, tenant boundaries and audit on real PostgreSQL', { skip: !url }, async t => {
  const db = client(); const service = new InventoryService(db, now);
  try {
    const owner = await fixture(db); const doctor = await fixture(db, 'PROFESSIONAL', owner.clinicId); const assistant = await fixture(db, 'ASSISTANT', owner.clinicId); const foreign = await fixture(db);
    const supplier = await service.saveSupplier(owner, { name: 'Dental fixture', contact: 'Pruebas', phone: '5550000000', email: 'fixture@example.test', notes: 'Solo pruebas' });
    const product = await service.saveProduct(owner, { ...productInput, supplierId: supplier.id });
    await t.test('create product and supplier with exact reference cost and empty status', async () => { const d = await service.detail(owner, product.id); assert.equal(d.product.stock, '0'); assert.equal(d.product.stockStatus, 'EMPTY'); assert.equal(d.product.referenceCost?.toString(), '123.45'); assert.equal(d.product.supplier?.id, supplier.id); });
    await t.test('all existing roles read full inventory without a professional profile', async () => { for (const ctx of [owner, doctor, assistant]) { const list = await service.list(ctx); assert.equal(list.products.length, 1); assert.equal(list.suppliers[0]?.phone, '5550000000'); assert.equal(list.canManage, ctx.role === 'OWNER'); assert.equal((await service.detail(ctx, product.id)).product.id, product.id); } });
    await t.test('administrative actions rejected for doctor/assistant even with forged ctx.role', async () => { for (const ctx of [doctor, assistant]) { const forged = { ...ctx, role: 'OWNER' }; await assert.rejects(service.saveProduct(forged, productInput), { code: 'FORBIDDEN' }); await assert.rejects(service.saveSupplier(forged, { name: 'Forbidden' }), { code: 'FORBIDDEN' }); await assert.rejects(service.move(forged, product.id, { ...entry, type: 'ADJUSTMENT_IN', reason: 'Conteo' }), { code: 'FORBIDDEN' }); } });
    let lotId = '';
    await t.test('assistant entry creates unnamed lot, immutable movement and atomic audit', async () => { const result = await service.move(assistant, product.id, { ...entry, supplierId: supplier.id, unitCost: '10.05' }); lotId = result.movement.lotId; assert.equal(result.product.stock, '10'); assert.equal(result.product.lots[0]?.number, null); assert.equal(result.product.lots[0]?.initialQuantity.toString(), '10'); assert.equal(result.movement.createdByMembershipId, assistant.membershipId); const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: result.movement.id } }); assert.equal(audit.actorUserId, assistant.userId); assert.equal(audit.clinicId, owner.clinicId); assert.equal(audit.action, 'INVENTORY_ENTRY'); });
    await t.test('doctor consumption leaves exact stock and reason', async () => { const result = await service.move(doctor, product.id, { type: 'CONSUMPTION', quantity: '3', lotId, effectiveDate: entry.effectiveDate, note: 'Uso de turno' }); assert.equal(result.product.stock, '7'); assert.equal(result.movement.reason, 'Uso clínico'); });
    await t.test('merma is distinct and auditable', async () => { const result = await service.move(assistant, product.id, { type: 'WASTE', quantity: '1', lotId, effectiveDate: entry.effectiveDate, reason: 'Contaminación' }); assert.equal(result.product.stock, '6'); assert.equal(result.movement.reason, 'Contaminación'); });
    await t.test('owner adjustments produce ledger-based low stock', async () => { await service.move(owner, product.id, { type: 'ADJUSTMENT_IN', quantity: '1', lotId, effectiveDate: entry.effectiveDate, reason: 'Conteo físico' }); const result = await service.move(owner, product.id, { type: 'ADJUSTMENT_OUT', quantity: '5', lotId, effectiveDate: entry.effectiveDate, reason: 'Conteo físico' }); assert.equal(result.product.stock, '2'); assert.equal(result.product.stockStatus, 'LOW'); });
    await t.test('all outflows reject negative stock and roll back version/audit', async () => { const before = await service.detail(owner, product.id); const count = await db.auditEvent.count({ where: { clinicId: owner.clinicId } }); for (const type of ['CONSUMPTION', 'WASTE', 'ADJUSTMENT_OUT']) await assert.rejects(service.move(owner, product.id, { type, quantity: '3', lotId, effectiveDate: entry.effectiveDate, reason: 'Test' }), { code: 'INSUFFICIENT_STOCK' }); const after = await service.detail(owner, product.id); assert.equal(after.product.version, before.product.version); assert.equal(after.movements.length, before.movements.length); assert.equal(await db.auditEvent.count({ where: { clinicId: owner.clinicId } }), count); });
    await t.test('edit minimum, preserve history and reject stale version/unit changes', async () => { const p = (await service.detail(owner, product.id)).product; await service.saveProduct(owner, { ...editProduct(p), minimumStock: '1' }, p.id); assert.equal((await service.detail(owner, p.id)).product.stockStatus, 'NORMAL'); await assert.rejects(service.saveProduct(owner, editProduct(p), p.id), { code: 'CONCURRENCY_ERROR' }); await assert.rejects(service.saveProduct(owner, { ...editProduct(p), unit: 'pieza' }, p.id), { code: 'UNIT_LOCKED' }); const audit = await db.auditEvent.findFirstOrThrow({ where: { clinicId: owner.clinicId, action: 'INVENTORY_PRODUCT_UPDATED' } }); assert.ok(JSON.stringify(audit.metadata).includes('minimumStock')); });
    await t.test('full consumption produces exhausted state', async () => { const r = await service.move(doctor, product.id, { type: 'CONSUMPTION', quantity: '2', lotId, effectiveDate: entry.effectiveDate }); assert.equal(r.product.stock, '0'); assert.equal(r.product.stockStatus, 'EMPTY'); });
    const multiple = await service.saveProduct(owner, { ...productInput, name: 'Resina A2', unit: 'jeringa' });
    let expiredLot = '';
    await t.test('multiple lots, FEFO order, today/near/expired states and usable stock', async () => {
      await service.move(owner, multiple.id, { ...entry, quantity: '8', number: 'RX-FUTURE', expiryDate: '2027-03-20' });
      await service.move(owner, multiple.id, { ...entry, quantity: '3', number: 'RX-NEAR', expiryDate: '2026-09-28' });
      expiredLot = (await service.move(owner, multiple.id, { ...entry, quantity: '2', number: 'RX-EXPIRED', expiryDate: '2026-09-05' })).movement.lotId;
      await service.move(owner, multiple.id, { ...entry, quantity: '1', number: 'RX-TODAY', expiryDate: '2026-09-10' });
      const p = (await service.detail(doctor, multiple.id)).product;
      assert.equal(p.stock, '14'); assert.equal(p.usableStock, '12'); assert.equal(p.expiredStock, '2'); assert.equal(p.expiring, true); assert.equal(p.expired, true);
      assert.deepEqual(p.lots.map(l => l.number), ['RX-EXPIRED', 'RX-TODAY', 'RX-NEAR', 'RX-FUTURE']); assert.equal(p.lots[1]?.expiryLabel, 'Caduca hoy');
    });
    await t.test('expired lot consumption blocked even when backdated; merma permitted', async () => { await assert.rejects(service.move(doctor, multiple.id, { type: 'CONSUMPTION', quantity: '1', lotId: expiredLot, effectiveDate: entry.effectiveDate }), { code: 'LOT_EXPIRED' }); const r = await service.move(assistant, multiple.id, { type: 'WASTE', quantity: '2', lotId: expiredLot, effectiveDate: entry.effectiveDate, reason: 'Caducidad' }); assert.equal(r.product.expired, false); assert.equal(r.product.stock, '12'); });
    await t.test('future and pre-receipt effective dates rejected', async () => { await assert.rejects(service.move(owner, product.id, { ...entry, effectiveDate: '2026-09-11' }), { code: 'INVALID_DATE' }); await assert.rejects(service.move(owner, product.id, { type: 'CONSUMPTION', quantity: '1', lotId, effectiveDate: '2026-09-09' }), { code: 'INVALID_DATE' }); });
    await t.test('clinic B cannot read/update/move clinic A products or update suppliers', async () => { const list = await service.list(foreign); assert.equal(list.products.length, 0); assert.equal(list.suppliers.length, 0); assert.equal(list.movements.length, 0); await assert.rejects(service.detail(foreign, product.id), { code: 'NOT_FOUND' }); await assert.rejects(service.saveProduct(foreign, { ...productInput, expectedVersion: 1 }, product.id), { code: 'NOT_FOUND' }); await assert.rejects(service.move(foreign, product.id, entry), { code: 'NOT_FOUND' }); await assert.rejects(service.saveSupplier(foreign, { name: 'Foreign', expectedVersion: 1 }, supplier.id), { code: 'NOT_FOUND' }); });
    await t.test('cross-tenant supplier and lot references rejected by backend', async () => { const p = await service.saveProduct(foreign, productInput); await assert.rejects(service.saveProduct(foreign, { ...productInput, supplierId: supplier.id }), { code: 'INVALID_SUPPLIER' }); await assert.rejects(service.move(foreign, p.id, { ...entry, supplierId: supplier.id }), { code: 'INVALID_SUPPLIER' }); await assert.rejects(service.move(foreign, p.id, { type: 'CONSUMPTION', quantity: '1', lotId, effectiveDate: entry.effectiveDate }), { code: 'NOT_FOUND' }); await assert.rejects(service.move(owner, multiple.id, { type: 'CONSUMPTION', quantity: '1', lotId, effectiveDate: entry.effectiveDate }), { code: 'NOT_FOUND' }); });
    await t.test('composite DB foreign keys reject foreign clinic suppliers/lots/actors', async () => {
      await assert.rejects(db.inventoryProduct.create({ data: { ...productInput, clinicId: foreign.clinicId, supplierId: supplier.id } }), { code: 'P2003' });
      await assert.rejects(db.inventoryLot.create({ data: { clinicId: foreign.clinicId, productId: product.id, receivedAt: now(), initialQuantity: '1' } }), { code: 'P2003' });
      await assert.rejects(db.inventoryMovement.create({ data: { clinicId: owner.clinicId, productId: product.id, lotId, type: 'ENTRY', quantity: '1', effectiveDate: now(), reason: 'test', createdByMembershipId: foreign.membershipId } }), { code: 'P2003' });
      await assert.rejects(db.inventoryMovement.create({ data: { clinicId: owner.clinicId, productId: multiple.id, lotId, type: 'ENTRY', quantity: '1', effectiveDate: now(), reason: 'test', createdByMembershipId: owner.membershipId } }), { code: 'P2003' });
    });
    await t.test('movement immutability and positive constraints enforced by PostgreSQL', async () => {
      const m = (await service.detail(owner, product.id)).movements[0]!;
      await assert.rejects(db.inventoryMovement.update({ where: { id: m.id }, data: { quantity: '99' } }));
      await assert.rejects(db.inventoryMovement.delete({ where: { id: m.id } }));
      await assert.rejects(db.inventoryMovement.create({ data: { clinicId: owner.clinicId, productId: product.id, lotId, type: 'ENTRY', quantity: '0', effectiveDate: now(), reason: 'test', createdByMembershipId: owner.membershipId } }));
      await assert.rejects(db.inventoryProduct.update({ where: { id: product.id }, data: { minimumStock: '-1' } }));
      await assert.rejects(db.inventoryProduct.delete({ where: { id: product.id } }), { code: 'P2003' });
    });
    await t.test('supplier edit/version/deactivation retains references but prevents new use', async () => {
      const updated = await service.saveSupplier(owner, { name: 'Dental updated', active: false, expectedVersion: 1 }, supplier.id); assert.equal(updated.version, 2);
      await assert.rejects(service.saveSupplier(owner, { name: 'Stale', expectedVersion: 1 }, supplier.id), { code: 'CONCURRENCY_ERROR' });
      await assert.rejects(service.move(owner, product.id, { ...entry, supplierId: supplier.id }), { code: 'INVALID_SUPPLIER' });
      assert.equal((await service.detail(owner, product.id)).product.lots[0]?.supplier?.name, 'Dental updated');
    });
    await t.test('deactivation retains lots and history, blocks all movements, supports reactivation', async () => {
      const before = await service.detail(owner, product.id); await service.saveProduct(owner, { ...editProduct(before.product), active: false }, product.id);
      const after = await service.detail(doctor, product.id); assert.equal(after.product.active, false); assert.equal(after.movements.length, before.movements.length); assert.equal(after.product.lots.length, before.product.lots.length);
      for (const type of ['ENTRY', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']) await assert.rejects(service.move(owner, product.id, { ...entry, type, lotId: type === 'ENTRY' ? null : lotId, reason: 'Test' }), { code: 'PRODUCT_INACTIVE' });
      await service.saveProduct(owner, { ...editProduct(after.product), active: true }, product.id); assert.equal((await service.detail(owner, product.id)).product.active, true);
    });
    await t.test('audit failure rolls back receipt, movement and product version together', async () => {
      const before = await service.detail(owner, product.id);
      const failure = new Error('Simulated audit unavailable');
      const transactional = { $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(tx => fn(new Proxy(tx, {
        get(target, key) { return key === 'auditEvent' ? { create: async () => { throw failure; } } : Reflect.get(target, key); },
      })), { isolationLevel: 'Serializable' }) } as unknown as PrismaClient;
      await assert.rejects(new InventoryService(transactional, now).move(owner, product.id, entry), e => e === failure);
      const after = await service.detail(owner, product.id);
      assert.equal(after.product.stock, before.product.stock); assert.equal(after.product.version, before.product.version);
      assert.equal(after.product.lots.length, before.product.lots.length); assert.equal(after.movements.length, before.movements.length);
    });
    await t.test('expiry changes at clinic midnight without persisting a status', async () => {
      const tomorrow = new InventoryService(db, () => new Date('2026-09-11T06:00:00Z'));
      const p = (await tomorrow.detail(owner, multiple.id)).product;
      assert.equal(p.lots.find(l => l.number === 'RX-TODAY')?.expiryStatus, 'EXPIRED');
      assert.equal(p.usableStock, '11'); assert.equal(p.stock, '12');
    });
    await t.test('disabled users, suspended membership/clinic and forged user-clinic context denied', async () => {
      await assert.rejects(service.list({ ...owner, userId: foreign.userId }), { code: 'FORBIDDEN' }); await assert.rejects(service.list({ ...owner, clinicId: foreign.clinicId }), { code: 'FORBIDDEN' });
      await db.membership.update({ where: { id: assistant.membershipId }, data: { status: 'SUSPENDED' } }); await assert.rejects(service.list(assistant), { code: 'FORBIDDEN' });
      await db.user.update({ where: { id: doctor.userId }, data: { status: 'DISABLED' } }); await assert.rejects(service.detail(doctor, product.id), { code: 'FORBIDDEN' });
      await db.clinic.update({ where: { id: foreign.clinicId }, data: { status: 'SUSPENDED' } }); await assert.rejects(service.list(foreign), { code: 'FORBIDDEN' });
    });
  } finally { await db.$disconnect(); }
});

for (const quantity of ['4', '5']) test(`real concurrent outflows ${quantity}+${quantity} against stock 5 cannot both commit`, { skip: !url }, async () => {
  const db = client(); const service = new InventoryService(db, now);
  try {
    const owner = await fixture(db); const doctor = await fixture(db, 'PROFESSIONAL', owner.clinicId); const assistant = await fixture(db, 'ASSISTANT', owner.clinicId);
    const p = await service.saveProduct(owner, productInput); const receipt = await service.move(owner, p.id, { ...entry, quantity: '5' });
    const results = await Promise.allSettled([doctor, assistant].map(ctx => service.move(ctx, p.id, { type: 'CONSUMPTION', quantity, lotId: receipt.movement.lotId, effectiveDate: entry.effectiveDate })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const failure = results.find(r => r.status === 'rejected') as PromiseRejectedResult; assert.ok(['CONCURRENCY_ERROR', 'INSUFFICIENT_STOCK'].includes(failure.reason.code));
    const detail = await service.detail(owner, p.id); assert.equal(detail.product.stock, quantity === '4' ? '1' : '0'); assert.equal(detail.movements.length, 2);
    assert.equal(await db.auditEvent.count({ where: { clinicId: owner.clinicId, action: 'INVENTORY_CONSUMPTION' } }), 1);
  } finally { await db.$disconnect(); }
});
