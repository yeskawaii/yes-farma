import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { capabilitiesFor, assertCapability } from './capabilities';
import { clinicConfigurationSchema } from './ClinicConfigurationService';

test('two clinic policies retain shared modules and only dentistry enables dental tools', () => {
  for (const specialty of ['DENTISTRY', 'PEDIATRICS'] as const) {
    for (const module of ['patients', 'appointments', 'encounters', 'documents', 'prescriptions', 'treatmentPlans', 'budgets', 'payments', 'inventory'] as const) assert.equal(capabilitiesFor(specialty)[module], true);
  }
  assert.doesNotThrow(() => assertCapability('DENTISTRY', 'odontogram'));
  assert.throws(() => assertCapability('PEDIATRICS', 'odontogram'), { code: 'CLINIC_CAPABILITY_DISABLED' });
  for (const clinicalSpecialty of ['GENERAL', '', 'ORTHODONTICS']) assert.equal(clinicConfigurationSchema.safeParse({ clinicalSpecialty, expectedSpecialty: 'DENTISTRY' }).success, false);
  assert.equal(clinicConfigurationSchema.safeParse({ clinicalSpecialty: 'PEDIATRICS', expectedSpecialty: 'DENTISTRY', clinicId: randomUUID() }).success, false);
});

const url = process.env.SPECIALTY_TEST_DATABASE_URL;
test('PostgreSQL and HTTP: active clinic policy, roles, encounters, prescriptions, tenant isolation', { skip: !url }, async t => {
  assert.match(url!, /^postgresql:\/\/test:test@127\.0\.0\.1:55439\/prescriptions_test$/);
  process.env.DATABASE_URL = url!;
  const { prisma: db } = await import('../../infrastructure/database/prisma.js');
  const { createApp } = await import('../../app/app.js');
  const { CryptoService } = await import('../identity/infrastructure/CryptoService.js');
  const { env } = await import('../../config/env.js');
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await db.$disconnect(); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await t.test('migration backfills an existing clinic and preserves old patients and integer heights', async () => {
    const migration = await readFile('prisma/migrations/20260912000000_clinic_specialty/migration.sql', 'utf8');
    const schema = `migration_fixture_${randomUUID().replaceAll('-', '')}`;
    const rollback = new Error('ROLLBACK_MIGRATION_FIXTURE');
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe('CREATE TABLE "Clinic" (id TEXT PRIMARY KEY)');
      await tx.$executeRawUnsafe('CREATE TABLE "Patient" (id TEXT PRIMARY KEY)');
      await tx.$executeRawUnsafe('CREATE TABLE "ClinicalVitalSigns" ("heightCm" INTEGER)');
      await tx.$executeRawUnsafe(`INSERT INTO "Clinic" VALUES ('existing-clinic')`);
      await tx.$executeRawUnsafe(`INSERT INTO "Patient" VALUES ('existing-patient')`);
      await tx.$executeRawUnsafe('INSERT INTO "ClinicalVitalSigns" VALUES (75)');
      for (const statement of migration.split(';').filter(s => s.trim())) await tx.$executeRawUnsafe(statement);
      const clinics = await tx.$queryRawUnsafe<Array<{ clinicalSpecialty: string }>>('SELECT "clinicalSpecialty" FROM "Clinic"');
      assert.equal(clinics[0]?.clinicalSpecialty, 'DENTISTRY');
      const heights = await tx.$queryRawUnsafe<Array<{ heightCm: number }>>('SELECT "heightCm" FROM "ClinicalVitalSigns"');
      assert.equal(heights[0]?.heightCm, 75);
      const patients = await tx.$queryRawUnsafe<Array<{ id: string; guardianName: string | null }>>('SELECT id, "guardianName" FROM "Patient"');
      assert.equal(patients[0]?.id, 'existing-patient'); assert.equal(patients[0]?.guardianName, null);
      throw rollback;
    }), e => e === rollback);
  });
  const dental = await db.clinic.create({ data: { name: 'Specialty default dental fixture' } });
  assert.equal(dental.clinicalSpecialty, 'DENTISTRY');
  const pediatric = await db.clinic.create({ data: { name: 'Specialty pediatric fixture', clinicalSpecialty: 'PEDIATRICS' } });
  async function member(role: 'OWNER' | 'PROFESSIONAL' | 'ASSISTANT') {
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.test`, firstName: 'Prueba', lastName: role, passwordHash: 'unused' } });
    const membership = await db.membership.create({ data: { userId: user.id, clinicId: pediatric.id, role, ...(role !== 'ASSISTANT' ? { profile: { create: { specialtyCode: 'PEDIATRICS', professionalLicense: 'TEST', professionalAddress: 'Consultorio de prueba' } } } : {}) } });
    const raw = randomUUID();
    const session = await db.session.create({ data: { userId: user.id, activeClinicId: pediatric.id, tokenHash: CryptoService.hashSessionToken(raw), expiresAt: new Date(Date.now() + 3600000) } });
    return { user, membership, session, raw };
  }
  const owner = await member('OWNER'); const professional = await member('PROFESSIONAL'); const assistant = await member('ASSISTANT');
  async function request(actor: typeof owner, method: string, path: string, body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { Cookie: `${env.SESSION_COOKIE_NAME}=${actor.raw}`, Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' }, ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
  }
  const patientResponse = await request(assistant, 'POST', '/patients', { firstName: 'Paciente', lastName: randomUUID(), birthDate: '2024-01-02', guardianName: 'Responsable', guardianPhone: '5550000000', guardianRelationship: 'Madre' });
  assert.equal(patientResponse.status, 201, JSON.stringify(patientResponse.body));
  const patientId = patientResponse.body.id;
  const patient = await db.patient.findUniqueOrThrow({ where: { id: patientId } });
  assert.equal(patient.guardianName, 'Responsable');
  const dentalMember = await db.membership.create({ data: { userId: owner.user.id, clinicId: dental.id, role: 'OWNER', profile: { create: { specialtyCode: 'DENTISTRY' } } } });
  const dentalPatient = await db.patient.create({ data: { clinicId: dental.id, firstName: 'Dental', lastName: 'Fixture', createdByMembershipId: dentalMember.id, updatedByMembershipId: dentalMember.id } });

  await t.test('all roles receive pediatric capabilities independently of professional profile', async () => {
    for (const actor of [owner, professional, assistant]) {
      const me = await request(actor, 'GET', '/auth/me');
      assert.equal(me.status, 200);
      const active = me.body.memberships.find((m: any) => m.clinicId === me.body.activeClinicId);
      assert.equal(active.clinicalSpecialty, 'PEDIATRICS'); assert.equal(active.clinicCapabilities.odontogram, false);
      assert.equal(active.clinicCapabilities.prescriptions, true);
      if (actor === assistant) assert.equal(active.specialtyCode, undefined);
    }
  });
  await t.test('every odontogram endpoint denies pediatric requests, including reads', async () => {
    for (const actor of [owner, professional, assistant]) for (const [method, suffix] of [
      ['GET', ''], ['GET', '/teeth/16'], ['POST', '/findings'], ['POST', '/batch'], ['POST', `/findings/${randomUUID()}/resolve`], ['POST', `/findings/${randomUUID()}/cancel`],
    ]) {
      const result = await request(actor, method!, `/patients/${patientId}/odontogram${suffix}`, {});
      assert.equal(result.status, 403); assert.equal(result.body.error.code, 'CLINIC_CAPABILITY_DISABLED');
    }
    const { OdontogramService } = await import('../odontogram/application/OdontogramService.js');
    const service = new OdontogramService(db);
    await assert.rejects(service.getOdontogram(pediatric.id, patientId, owner.membership.id), { code: 'NOT_FOUND' });
    const result = await request(owner, 'POST', `/patients/${patientId}/treatments`, { name: 'Dental injection', price: '100', toothNumber: 16, surfaces: ['OCCLUSAL'] });
    assert.equal(result.status, 403);
  });
  await t.test('only real owner configures own clinic, conflicts and tenant tampering are rejected', async () => {
    for (const actor of [professional, assistant]) assert.equal((await request(actor, 'PATCH', '/clinic-configuration', { clinicalSpecialty: 'DENTISTRY', expectedSpecialty: 'PEDIATRICS' })).status, 403);
    assert.equal((await request(owner, 'PATCH', '/clinic-configuration', { clinicalSpecialty: 'DENTISTRY', expectedSpecialty: 'DENTISTRY' })).status, 409);
    assert.equal((await request(owner, 'PATCH', '/clinic-configuration', { clinicalSpecialty: 'DENTISTRY', expectedSpecialty: 'PEDIATRICS', clinicId: dental.id })).status, 400);
    assert.equal((await request(assistant, 'POST', '/auth/active-clinic', { clinicId: dental.id })).status, 403);
    assert.equal((await request(owner, 'GET', `/patients/${dentalPatient.id}`)).status, 404);
    assert.equal((await request(owner, 'PATCH', '/clinic-configuration', { clinicalSpecialty: 'DENTISTRY', expectedSpecialty: 'PEDIATRICS' })).status, 200);
    assert.equal((await request(assistant, 'GET', '/auth/me')).body.memberships[0].clinicCapabilities.odontogram, true);
    assert.equal((await request(owner, 'PATCH', '/clinic-configuration', { clinicalSpecialty: 'PEDIATRICS', expectedSpecialty: 'DENTISTRY' })).status, 200);
    assert.equal(await db.auditEvent.count({ where: { clinicId: pediatric.id, action: 'CLINIC_SPECIALTY_UPDATED' } }), 2);
  });
  await t.test('switching clinics changes capabilities and preserves dental access and tenant checks', async () => {
    assert.equal((await request(owner, 'POST', '/auth/active-clinic', { clinicId: dental.id })).status, 200);
    const me = (await request(owner, 'GET', '/auth/me')).body;
    assert.equal(me.activeClinicId, dental.id); assert.equal(me.memberships.find((m: any) => m.clinicId === dental.id).clinicCapabilities.odontogram, true);
    assert.equal((await request(owner, 'GET', `/patients/${dentalPatient.id}/odontogram`)).status, 200);
    assert.equal((await request(owner, 'GET', `/patients/${patientId}/odontogram`)).status, 404);
    assert.equal((await request(owner, 'GET', `/patients/${patientId}`)).status, 404);
    assert.equal((await request(owner, 'POST', '/auth/active-clinic', { clinicId: pediatric.id })).status, 200);
  });
  await t.test('assistant schedules pediatric care; professional starts and finalizes the shared encounter', async () => {
    const startAt = new Date(Date.now() + 60000).toISOString();
    const endAt = new Date(Date.now() + 31 * 60000).toISOString();
    const created = await request(assistant, 'POST', '/appointments', { patientId, professionalMembershipId: professional.membership.id, startAt, endAt, reason: 'Consulta pediátrica' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    for (const days of [1, 7, 30]) {
      const query = new URLSearchParams({ startAt: new Date(Date.now()).toISOString(), endAt: new Date(Date.now() + days * 86400000).toISOString() });
      assert.equal((await request(assistant, 'GET', `/appointments?${query}`)).status, 200);
    }
    const started = await request(professional, 'POST', `/appointments/${created.body.id}/start-care`, {});
    assert.equal(started.status, 201, JSON.stringify(started.body));
    const encounterId = started.body.encounter.id;
    assert.equal((await request(professional, 'POST', `/clinical-encounters/${encounterId}/finalize`, { version: 1 })).status, 200);
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: created.body.id } })).status, 'COMPLETED');
  });
  await t.test('pediatric services use existing budgets, discounts, payments and printing', async () => {
    const treatment = await request(owner, 'POST', `/patients/${patientId}/treatments`, { name: 'Consulta pediátrica', price: '500' });
    assert.equal(treatment.status, 201);
    const budget = await request(owner, 'POST', `/patients/${patientId}/budgets`, { treatmentIds: [treatment.body.id], discount: '50' });
    assert.equal(budget.status, 201);
    const path = `/patients/${patientId}/budgets/${budget.body.id}`;
    assert.equal((await request(owner, 'PATCH', path, { status: 'PRESENTED', expectedVersion: 1 })).status, 200);
    assert.equal((await request(owner, 'PATCH', path, { status: 'ACCEPTED', expectedVersion: 2 })).status, 200);
    assert.equal((await request(owner, 'POST', `${path}/payments`, { amount: '200', method: 'CASH', paidAt: new Date().toISOString().slice(0, 10) })).status, 201);
    const print = await request(owner, 'GET', `${path}/print`);
    assert.equal(print.status, 200); assert.equal(print.body.budget.balance, '250.00'); assert.equal(print.body.clinic.dentalClinicalTools, false);
  });
  await t.test('owner and professional save pediatric notes, six dated vitals and issue existing prescriptions', async () => {
    for (const actor of [owner, professional]) {
      const created = await request(actor, 'POST', '/clinical-encounters', { patientId, occurredAt: new Date().toISOString() });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const encounterId = created.body.id;
      const measuredAt = new Date().toISOString();
      const updated = await request(actor, 'PATCH', `/clinical-encounters/${encounterId}`, { version: 1, reasonForVisit: 'Revisión', relevantHistory: 'Notas relevantes', physicalExamination: 'Exploración registrada', diagnoses: [{ description: 'Impresión clínica', isPrimary: true }], indications: 'Indicaciones profesionales', vitalSigns: { weightKg: 10.25, heightCm: 75.5, temperatureCelsius: 36.7, heartRate: 110, respiratoryRate: 28, oxygenSaturationPercent: 98, measuredAt } });
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      const vitals = await db.clinicalVitalSigns.findUniqueOrThrow({ where: { clinicId_encounterId: { clinicId: pediatric.id, encounterId } } });
      assert.equal(vitals.weightKg?.toString(), '10.25'); assert.equal(vitals.heightCm, 75.5); assert.equal(vitals.temperatureCelsius?.toString(), '36.7'); assert.equal(vitals.heartRate, 110); assert.equal(vitals.respiratoryRate, 28); assert.equal(vitals.oxygenSaturationPercent, 98); assert.equal(vitals.measuredAt.toISOString(), measuredAt);
      const rx = await request(actor, 'POST', `/prescriptions/patients/${patientId}`, { encounterId, items: [{ medication: 'Producto de prueba', concentration: 'Concentración manual', form: 'Presentación manual', dose: 'Dosis escrita por profesional', route: 'Vía manual', frequency: 'Frecuencia manual', duration: 'Duración manual', quantity: 'Cantidad manual' }] });
      assert.equal(rx.status, 201, JSON.stringify(rx.body));
      const issued = await request(actor, 'POST', `/prescriptions/patients/${patientId}/${rx.body.id}/issue`, { expectedVersion: 1 });
      assert.equal(issued.status, 200, JSON.stringify(issued.body));
      const snapshot = issued.body.snapshot;
      assert.equal(snapshot.professional.specialty, 'PEDIATRICS'); assert.equal(snapshot.items[0].dose, 'Dosis escrita por profesional');
      assert.equal((await request(actor, 'PATCH', `/prescriptions/patients/${patientId}/${rx.body.id}`, { items: [], expectedVersion: 2 })).status, 409);
      assert.equal((await request(assistant, 'GET', `/clinical-encounters/${encounterId}`)).status, 403);
      assert.equal((await request(actor, 'POST', `/clinical-encounters/${encounterId}/finalize`, { version: 2 })).status, 200);
    }
    assert.equal((await request(assistant, 'POST', '/clinical-encounters', { patientId, occurredAt: new Date().toISOString() })).status, 403);
    assert.equal(await db.patient.count({ where: { id: patientId } }), 1);
  });
});
