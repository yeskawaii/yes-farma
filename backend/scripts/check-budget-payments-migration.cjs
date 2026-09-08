// Run only against the disposable local database. Does not load .env.
const { Client } = require('pg');
const { readFile, readdir } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
(async () => {
 const db = new Client({ connectionString: 'postgresql://postgres:disposable-test-only@127.0.0.1:55439/payments_test' });
 await db.connect();
 try {
  const schema = 'migration_' + randomUUID().replaceAll('-','');
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET search_path TO "${schema}"`);
  const migrations = (await readdir('prisma/migrations')).filter(n=>/^\d/.test(n)).sort();
  for(const name of migrations.slice(0,-1)) await db.query(await readFile(`prisma/migrations/${name}/migration.sql`,'utf8'));
  const clinic=randomUUID(), user=randomUUID(), member=randomUUID(), patient=randomUUID(), budget=randomUUID();
  await db.query('INSERT INTO "Clinic" (id,name,"updatedAt") VALUES ($1,$2,now())',[clinic,'Legacy fixture']);
  await db.query('INSERT INTO "User" (id,email,"passwordHash","firstName","lastName","updatedAt") VALUES ($1,$2,$3,$4,$5,now())',[user,'legacy@example.test','fixture','Legacy','User']);
  await db.query('INSERT INTO "Membership" (id,"userId","clinicId",role,"updatedAt") VALUES ($1,$2,$3,$4,now())',[member,user,clinic,'OWNER']);
  await db.query('INSERT INTO "Patient" (id,"clinicId","firstName","lastName","createdByMembershipId","updatedByMembershipId","updatedAt") VALUES ($1,$2,$3,$4,$5,$5,now())',[patient,clinic,'Legacy','Patient',member]);
  await db.query('INSERT INTO "TreatmentBudget" (id,"clinicId","patientId",subtotal,discount,total,"updatedAt") VALUES ($1,$2,$3,100,10,90,now())',[budget,clinic,patient]);
  const before=(await db.query('SELECT row_to_json(b) AS value FROM "TreatmentBudget" b')).rows[0].value;
  await db.query(await readFile(`prisma/migrations/${migrations.at(-1)}/migration.sql`,'utf8'));
  const after=(await db.query('SELECT row_to_json(b) AS value FROM "TreatmentBudget" b')).rows[0].value;
  assert.equal(after.folio,null); delete after.folio; assert.deepEqual(after,before);
  console.log(`PASS ${migrations.length} migrations; legacy budget unchanged; nullable folio; schema ${schema}`);
  // Expose this freshly migrated isolated schema for Prisma persistence checks.
  await require('node:fs/promises').writeFile('/tmp/yeskira-payments-test-schema',schema);
 } finally { await db.end(); }
})().catch(e=>{ console.error(e);process.exitCode=1; });
