// Fixed disposable local target. Never loads .env or uses application DATABASE_URL.
const { Client } = require('pg');
const { readFile, readdir, writeFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const url = 'postgresql://postgres:disposable-test-only@127.0.0.1:55440/inventory_test';
(async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  const schema = 'inventory_' + randomUUID().replaceAll('-', '');
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    const migrations = (await readdir('prisma/migrations')).filter(n => /^\d/.test(n)).sort();
    assert.equal(migrations.at(-1), '20260910030000_add_inventory_mvp');
    for (const name of migrations.slice(0, -1)) await db.query(await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8'));
    const clinic = randomUUID(), user = randomUUID(), member = randomUUID(), patient = randomUUID(), budget = randomUUID();
    await db.query('INSERT INTO "Clinic" (id,name,"updatedAt") VALUES ($1,$2,now())', [clinic, 'Legacy inventory fixture']);
    await db.query('INSERT INTO "User" (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES ($1,$2,$3,$4,$5,now())', [user, `${user}@example.test`, 'test-only', 'Legacy', 'Fixture']);
    await db.query('INSERT INTO "Membership" (id,"userId","clinicId",role,"updatedAt") VALUES ($1,$2,$3,$4,now())', [member, user, clinic, 'OWNER']);
    await db.query('INSERT INTO "Patient" (id,"clinicId","firstName","lastName","createdByMembershipId","updatedByMembershipId","updatedAt") VALUES ($1,$2,$3,$4,$5,$5,now())', [patient, clinic, 'Legacy', 'Patient', member]);
    await db.query('INSERT INTO "TreatmentBudget" (id,"clinicId","patientId",subtotal,discount,total,"updatedAt",folio) VALUES ($1,$2,$3,100,10,90,now(),$4)', [budget, clinic, patient, 'LEGACY-FIXTURE']);
    const tables = ['Clinic', 'User', 'Membership', 'Patient', 'TreatmentBudget'];
    const snapshot = async () => { const rows = []; for (const t of tables) rows.push((await db.query(`SELECT row_to_json(t) AS value FROM "${t}" t ORDER BY id`)).rows); return rows; };
    const before = await snapshot();
    await db.query('BEGIN');
    await db.query(await readFile(`prisma/migrations/${migrations.at(-1)}/migration.sql`, 'utf8'));
    await db.query('COMMIT');
    assert.deepEqual(await snapshot(), before);
    for (const table of ['InventoryProduct', 'InventorySupplier', 'InventoryLot', 'InventoryMovement']) assert.equal((await db.query(`SELECT count(*) FROM "${table}"`)).rows[0].count, '0');
    const foreignKeys = await db.query("SELECT count(*) FROM pg_constraint WHERE connamespace = $1::regnamespace AND contype = 'f' AND conrelid::regclass::text LIKE '%Inventory%'", [schema]);
    assert.equal(foreignKeys.rows[0].count, '7');
    const indexes = await db.query("SELECT count(*) FROM pg_indexes WHERE schemaname = $1 AND tablename LIKE 'Inventory%'", [schema]);
    assert.equal(indexes.rows[0].count, '12');
    await writeFile('/tmp/yeskira-inventory-test-schema', schema);
    console.log(`PASS ${migrations.length} migrations; 5 legacy tables unchanged; 4 empty new tables; 7 tenant FKs; 12 indexes. Schema: ${schema}`);
  } finally { await db.end(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
