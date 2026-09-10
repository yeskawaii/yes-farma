// Executes tests against the schema created by check-inventory-migration.cjs only.
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const schema = readFileSync('/tmp/yeskira-inventory-test-schema', 'utf8').trim();
if (!/^inventory_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid disposable schema');
const url = 'postgresql://postgres:disposable-test-only@127.0.0.1:55440/inventory_test';
const files = process.argv.includes('--all') ? ['src/**/*.test.ts'] : ['src/modules/inventory/*.test.ts'];
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--import', './src/test-setup.ts', ...files], { stdio: 'inherit', env: { ...process.env, INVENTORY_TEST_DATABASE_URL: url, INVENTORY_TEST_DATABASE_SCHEMA: schema, TREATMENT_TEST_DATABASE_URL: url, TREATMENT_TEST_DATABASE_SCHEMA: schema } });
process.exitCode = result.status ?? 1;
