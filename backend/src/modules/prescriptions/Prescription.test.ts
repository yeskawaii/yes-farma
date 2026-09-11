import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';
import { PrescriptionService } from './PrescriptionService';
import { completeItems, draftSchema } from './PrescriptionSchema';
const item = { medication: 'Medicamento de prueba', brand: '', concentration: '10 mg', form: 'Tableta', dose: '1 tableta', route: 'Oral', frequency: 'Frecuencia indicada', duration: 'Duración indicada', quantity: 'Cantidad indicada', instructions: '' };
test('draft capture is structured, bounded and rejects privilege/association tampering', () => {
  assert.equal(completeItems([]), false);
  for (const key of ['medication','concentration','form','dose','route','frequency','duration','quantity']) assert.equal(completeItems([{ ...item, [key]: '' }]), false);
  assert.equal(completeItems([item]), true);
  for (const key of ['clinicId','prescriberMembershipId','folio','status','snapshot']) assert.equal(draftSchema.safeParse({ items: [item], [key]: randomUUID() }).success, false);
  assert.equal(draftSchema.safeParse({ items: [] }).success, true);
  assert.equal(draftSchema.safeParse({ items: Array(31).fill(item) }).success, false);
});
const url = process.env.PRESCRIPTION_TEST_DATABASE_URL;
test('PostgreSQL lifecycle, tenancy, concurrency, snapshot, constraints and atomic audit', { skip: !url }, async t => {
  assert.match(url!, /127\.0\.0\.1:55439\/prescriptions_test$/);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const service = new PrescriptionService(db);
  t.after(() => db.$disconnect());
  const clinic = await db.clinic.create({ data: { name: 'Clínica original' } });
  const otherClinic = await db.clinic.create({ data: { name: 'Otra clínica' } });
  async function member(role: 'OWNER' | 'PROFESSIONAL' | 'ASSISTANT', clinicId = clinic.id) {
    const u = await db.user.create({ data: { firstName: 'Nombre', lastName: 'Profesional', email: `${randomUUID()}@example.test`, passwordHash: 'unused' } });
    const m = await db.membership.create({ data: { userId: u.id, clinicId, role } });
    return { userId: u.id, membershipId: m.id, clinicId, role, sessionId: randomUUID() };
  }
  const owner = await member('OWNER'); const professional = await member('PROFESSIONAL'); const assistant = await member('ASSISTANT'); const foreign = await member('OWNER', otherClinic.id);
  const patient = await db.patient.create({ data: { clinicId: clinic.id, firstName: 'Paciente', lastName: 'Original', birthDate: new Date('1990-01-02'), createdByMembershipId: owner.membershipId, updatedByMembershipId: owner.membershipId } });
  const patientB = await db.patient.create({ data: { clinicId: otherClinic.id, firstName: 'Paciente B', lastName: 'Original', birthDate: new Date('1990-01-02'), createdByMembershipId: foreign.membershipId, updatedByMembershipId: foreign.membershipId } });
  const input = { items: [item], generalInstructions: 'Indicaciones originales' };
  const profile = { professionalLicense: 'TEST-123', specialtyCode: 'Odontología', specialtyLicense: '', professionalAddress: 'Consultorio de prueba', professionalPhone: '' };
  let rx = await service.save(owner, patient.id, { items: [] });
  await t.test('draft creation and editing do not allocate folio; stale editing rejected', async () => {
    assert.equal(rx.folio, null); assert.equal(rx.status, 'DRAFT');
    rx = await service.save(owner, patient.id, { ...input, expectedVersion: rx.version }, rx.id);
    assert.equal(rx.items.length, 1); assert.equal(rx.version, 2);
    await assert.rejects(service.save(owner, patient.id, { ...input, expectedVersion: 1 }, rx.id), { code: 'CONFLICT' });
  });
  await t.test('required professional data and complete medication/patient data enforced', async () => {
    await assert.rejects(service.issue(owner, patient.id, rx.id, { expectedVersion: rx.version }), { code: 'PROFILE_INCOMPLETE' });
    await service.saveProfile(owner, profile); await service.saveProfile(professional, profile);
    const incomplete = await service.save(owner, patient.id, { items: [{ ...item, dose: '' }] });
    await assert.rejects(service.issue(owner, patient.id, incomplete.id, { expectedVersion: 1 }), { code: 'INCOMPLETE_ITEMS' });
    await db.patient.update({ where: { id: patient.id }, data: { birthDate: null } });
    await assert.rejects(service.issue(owner, patient.id, rx.id, { expectedVersion: rx.version }), { code: 'PATIENT_INCOMPLETE' });
    await db.patient.update({ where: { id: patient.id }, data: { birthDate: new Date('1990-01-02') } });
  });
  await t.test('assistant denied all clinical operations; own active membership required', async () => {
    for (const ctx of [assistant, { ...owner, clinicId: otherClinic.id }, { ...owner, userId: foreign.userId }]) {
      await assert.rejects(service.list(ctx, patient.id), { code: 'FORBIDDEN' });
      await assert.rejects(service.get(ctx, patient.id, rx.id), { code: 'FORBIDDEN' });
      await assert.rejects(service.save(ctx, patient.id, input), { code: 'FORBIDDEN' });
      await assert.rejects(service.issue(ctx, patient.id, rx.id, { expectedVersion: rx.version }), { code: 'FORBIDDEN' });
      await assert.rejects(service.cancel(ctx, patient.id, rx.id, { expectedVersion: rx.version, reason: 'Error de prueba' }), { code: 'FORBIDDEN' });
    }
    await assert.rejects(service.saveProfile(assistant, profile), { code: 'FORBIDDEN' });
  });
  await t.test('foreign clinic patient, prescription and encounter are inaccessible', async () => {
    await assert.rejects(service.save(owner, patientB.id, input), { code: 'NOT_FOUND' });
    await assert.rejects(service.get(foreign, patient.id, rx.id), { code: 'NOT_FOUND' });
    await assert.rejects(service.save(foreign, patientB.id, { ...input, expectedVersion: rx.version }, rx.id), { code: 'NOT_FOUND' });
    await assert.rejects(service.issue(foreign, patientB.id, rx.id, { expectedVersion: rx.version }), { code: 'NOT_FOUND' });
    await assert.rejects(service.cancel(foreign, patientB.id, rx.id, { expectedVersion: rx.version, reason: 'Error' }), { code: 'NOT_FOUND' });
    const encounter = await db.clinicalEncounter.create({ data: { clinicId: otherClinic.id, patientId: patientB.id, professionalMembershipId: foreign.membershipId, createdByMembershipId: foreign.membershipId, updatedByMembershipId: foreign.membershipId, occurredAt: new Date() } });
    await assert.rejects(service.save(owner, patient.id, { ...input, encounterId: encounter.id }), { code: 'INVALID_ENCOUNTER' });
    await assert.rejects(db.prescription.create({ data: { clinicId: clinic.id, patientId: patient.id, prescriberMembershipId: foreign.membershipId } }));
    await assert.rejects(db.prescription.create({ data: { clinicId: clinic.id, patientId: patientB.id, prescriberMembershipId: owner.membershipId } }));
  });
  await t.test('only originating prescriber can edit, issue or cancel', async () => {
    await assert.rejects(service.save(professional, patient.id, { ...input, expectedVersion: rx.version }, rx.id), { code: 'FORBIDDEN' });
    await assert.rejects(service.issue(professional, patient.id, rx.id, { expectedVersion: rx.version }), { code: 'FORBIDDEN' });
  });
  await t.test('concurrent issue of same draft produces one issuance and one audit', async () => {
    const results = await Promise.allSettled([service.issue(owner, patient.id, rx.id, { expectedVersion: rx.version }), service.issue(owner, patient.id, rx.id, { expectedVersion: rx.version })]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    rx = await service.get(owner, patient.id, rx.id);
    assert.equal(rx.status, 'ISSUED'); assert.match(rx.folio!, /^RX-[A-F0-9]{32}$/);
    assert.equal(await db.auditEvent.count({ where: { entityId: rx.id, action: 'PRESCRIPTION_ISSUED' } }), 1);
  });
  const original = JSON.stringify(rx.snapshot); const originalItems = JSON.stringify(rx.items); const folio = rx.folio;
  await t.test('issued prescription cannot edit or reissue; reprint retains snapshot after profile/patient/clinic changes', async () => {
    await assert.rejects(service.save(owner, patient.id, { ...input, expectedVersion: rx.version }, rx.id), { code: 'CONFLICT' });
    await assert.rejects(service.issue(owner, patient.id, rx.id, { expectedVersion: rx.version }), { code: 'CONFLICT' });
    await service.saveProfile(owner, { ...profile, professionalLicense: 'CHANGED', professionalAddress: 'Changed address' });
    await db.user.update({ where: { id: owner.userId }, data: { firstName: 'Changed' } });
    await db.patient.update({ where: { id: patient.id }, data: { firstName: 'Changed' } });
    await db.clinic.update({ where: { id: clinic.id }, data: { name: 'Changed', timeZone: 'America/Tijuana' } });
    const reprint = await service.get(owner, patient.id, rx.id);
    assert.equal(JSON.stringify(reprint.snapshot), original); assert.equal(reprint.folio, folio); assert.deepEqual(reprint.issuedAt, rx.issuedAt);
  });
  await t.test('PROFESSIONAL can issue, concurrent different drafts get distinct folios; DB uniqueness enforced', async () => {
    const a = await service.save(professional, patient.id, input); const b = await service.save(professional, patient.id, input);
    const issued = await Promise.all([service.issue(professional, patient.id, a.id, { expectedVersion: 1 }), service.issue(professional, patient.id, b.id, { expectedVersion: 1 })]);
    assert.equal(new Set([folio, ...issued.map(i => i.folio)]).size, 3);
    await assert.rejects(db.prescription.update({ where: { id: b.id }, data: { folio: issued[0]!.folio } }), { code: 'P2002' });
  });
  await t.test('cancellation preserves original, records reason/actor/time, and prevents further mutations', async () => {
    await assert.rejects(service.cancel(professional, patient.id, rx.id, { expectedVersion: rx.version, reason: 'Error' }), { code: 'FORBIDDEN' });
    rx = await service.cancel(owner, patient.id, rx.id, { expectedVersion: rx.version, reason: 'Error de captura' });
    assert.equal(rx.status, 'CANCELLED'); assert.equal(rx.folio, folio); assert.equal(rx.cancelledByMembershipId, owner.membershipId); assert.ok(rx.cancelledAt);
    assert.equal(JSON.stringify(rx.snapshot), original); assert.equal(JSON.stringify(rx.items), originalItems);
    await assert.rejects(service.cancel(owner, patient.id, rx.id, { expectedVersion: rx.version, reason: 'Otra vez' }), { code: 'CONFLICT' });
    await assert.rejects(service.issue(owner, patient.id, rx.id, { expectedVersion: rx.version }), { code: 'CONFLICT' });
    const audits = await db.auditEvent.findMany({ where: { entityId: rx.id }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(audits.map(a => a.action), ['PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ISSUED','PRESCRIPTION_CANCELLED']);
    assert.ok(audits.every(a => a.clinicId === clinic.id && a.actorUserId === owner.userId));
  });
  await t.test('edit versus issue race never mixes document data; active profile required; valid optional encounter', async () => {
    const encounter = await db.clinicalEncounter.create({ data: { clinicId: clinic.id, patientId: patient.id, professionalMembershipId: professional.membershipId, createdByMembershipId: professional.membershipId, updatedByMembershipId: professional.membershipId, occurredAt: new Date() } });
    const draft = await service.save(professional, patient.id, { ...input, encounterId: encounter.id });
    assert.equal(draft.encounterId, encounter.id);
    const race = await Promise.allSettled([
      service.save(professional, patient.id, { ...input, encounterId: encounter.id, generalInstructions: 'Changed concurrently', expectedVersion: 1 }, draft.id),
      service.issue(professional, patient.id, draft.id, { expectedVersion: 1 }),
    ]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    const after = await service.get(professional, patient.id, draft.id);
    if (after.status === 'ISSUED') { assert.equal(after.generalInstructions, input.generalInstructions); assert.equal((after.snapshot as { generalInstructions: string }).generalInstructions, input.generalInstructions); }
    else { assert.equal(after.status, 'DRAFT'); assert.equal(after.folio, null); assert.equal(after.generalInstructions, 'Changed concurrently'); }
    const inactive = await service.save(professional, patient.id, input);
    await db.professionalProfile.update({ where: { membershipId: professional.membershipId }, data: { active: false } });
    await assert.rejects(service.issue(professional, patient.id, inactive.id, { expectedVersion: 1 }), { code: 'PROFILE_INCOMPLETE' });
    await assert.rejects(service.saveProfile(professional, profile), { code: 'FORBIDDEN' });
    await db.professionalProfile.update({ where: { membershipId: professional.membershipId }, data: { active: true } });
    await db.patient.update({ where: { id: patient.id }, data: { status: 'INACTIVE' } });
    await assert.rejects(service.save(owner, patient.id, input), { code: 'PATIENT_INACTIVE' });
    await assert.rejects(service.issue(professional, patient.id, inactive.id, { expectedVersion: 1 }), { code: 'PATIENT_INACTIVE' });
    assert.equal((await service.get(owner, patient.id, rx.id)).folio, folio);
    await db.patient.update({ where: { id: patient.id }, data: { status: 'ACTIVE' } });
  });
  await t.test('HTTP routes enforce session, origin, roles, tenant scope and versioned lifecycle', async () => {
    (globalThis as unknown as { prisma: PrismaClient }).prisma = db;
    const express = (await import('express')).default;
    const cookieParser = (await import('cookie-parser')).default;
    const { createPrescriptionRoutes } = await import('./prescriptionRoutes.js');
    const { errorHandler } = await import('../../shared/errors/errorHandler.js');
    const { CryptoService } = await import('../identity/infrastructure/CryptoService.js');
    const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/rx', createPrescriptionRoutes(service)); app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as { port: number };
    async function token(ctx: typeof owner) {
      const value = randomUUID();
      await db.session.create({ data: { userId: ctx.userId, activeClinicId: ctx.clinicId, tokenHash: CryptoService.hashSessionToken(value), expiresAt: new Date(Date.now() + 60000) } });
      return value;
    }
    const ownerToken = await token(owner); const assistantToken = await token(assistant); const foreignToken = await token(foreign);
    const request = (method: string, path: string, body?: unknown, cookie: string = ownerToken, origin = 'https://yes-farma.test') => fetch(`http://127.0.0.1:${address.port}/rx${path}`, { method, headers: { Cookie: `yesfarma_sid=${cookie}`, Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    try {
      assert.equal((await request('GET', `/patients/${patient.id}`, undefined, '')).status, 401);
      assert.equal((await request('POST', `/patients/${patient.id}`, input, ownerToken, 'https://evil.example')).status, 403);
      assert.equal((await request('GET', `/patients/${patient.id}/${rx.id}`, undefined, foreignToken)).status, 404);
      assert.equal((await request('GET', `/patients/${patient.id}`, undefined, assistantToken)).status, 403);
      assert.equal((await request('POST', `/patients/${patient.id}`, { ...input, clinicId: otherClinic.id })).status, 400);
      const created = await request('POST', `/patients/${patient.id}`, input); assert.equal(created.status, 201); assert.equal(created.headers.get('cache-control'), 'private, no-store');
      let record = await created.json();
      const edited = await request('PATCH', `/patients/${patient.id}/${record.id}`, { ...input, expectedVersion: record.version }); assert.equal(edited.status, 200); record = await edited.json();
      assert.equal((await request('POST', `/patients/${patient.id}/${record.id}/issue`, { expectedVersion: record.version }, assistantToken)).status, 403);
      const issued = await request('POST', `/patients/${patient.id}/${record.id}/issue`, { expectedVersion: record.version }); assert.equal(issued.status, 200); record = await issued.json();
      assert.equal((await request('PATCH', `/patients/${patient.id}/${record.id}`, { ...input, expectedVersion: record.version })).status, 409);
      assert.equal((await request('POST', `/patients/${patient.id}/${record.id}/cancel`, { expectedVersion: record.version, reason: '  ' })).status, 400);
      const cancelled = await request('POST', `/patients/${patient.id}/${record.id}/cancel`, { expectedVersion: record.version, reason: 'Error documentado' }); assert.equal(cancelled.status, 200);
      const document = await cancelled.json(); assert.equal(document.folio, record.folio); assert.equal(document.status, 'CANCELLED'); assert.deepEqual(document.snapshot, record.snapshot);
    } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  });
  await t.test('audit failure rolls back draft and items', async () => {
    const before = await db.prescription.count();
    const broken = db.$extends({ query: { auditEvent: { async create() { throw new Error('Audit unavailable'); } } } });
    const svc = new PrescriptionService(broken as unknown as PrismaClient);
    await assert.rejects(svc.save(owner, patient.id, input), /Audit unavailable/);
    assert.equal(await db.prescription.count(), before);
  });
});
