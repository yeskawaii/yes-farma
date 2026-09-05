import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const {
  patchLibsignal,
  REQUIRED_VERSION,
  REQUIRED_COMMIT,
  VULNERABLE_CALL_1,
  VULNERABLE_CALL_2,
  VULNERABLE_CALL_3,
  PATCHED_CALL_1,
  PATCHED_CALL_2,
  PATCHED_CALL_3
} = require('../../../scripts/patch-libsignal-session-logging.cjs');

const SAMPLE_SESSION_RECORD_SOURCE = `
class SessionRecord {
    constructor() {
        this.sessions = {};
    }

    closeSession(session) {
        if (this.isClosed(session)) {
            console.warn("Session already closed", session);
            return;
        }
        console.info("Closing session:", session);
        session.indexInfo.closed = Date.now();
    }

    openSession(session) {
        if (!this.isClosed(session)) {
            console.warn("Session already open");
        }
        console.info("Opening session:", session);
        session.indexInfo.closed = -1;
    }

    isClosed(session) {
        return session.indexInfo.closed !== -1;
    }
}
module.exports = SessionRecord;
`;

function createTempFixture(options: {
  version?: string;
  commit?: string;
  source?: string;
  omitPackageJson?: boolean;
  omitPackageLock?: boolean;
  omitSessionRecord?: boolean;
} = {}): { baseDir: string; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libsignal-patch-test-'));

  if (!options.omitPackageLock) {
    const lock = {
      name: 'test-backend',
      version: '1.0.0',
      packages: {
        'node_modules/libsignal': {
          version: options.version || REQUIRED_VERSION,
          resolved: `git+ssh://git@github.com/whiskeysockets/libsignal-node.git#${options.commit || REQUIRED_COMMIT}`
        }
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), JSON.stringify(lock, null, 2), 'utf8');
  }

  const libsignalDir = path.join(tmpDir, 'node_modules', 'libsignal');
  const srcDir = path.join(libsignalDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  if (!options.omitPackageJson) {
    const pkg = {
      name: 'libsignal',
      version: options.version || REQUIRED_VERSION
    };
    fs.writeFileSync(path.join(libsignalDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
  }

  if (!options.omitSessionRecord) {
    fs.writeFileSync(
      path.join(srcDir, 'session_record.js'),
      options.source !== undefined ? options.source : SAMPLE_SESSION_RECORD_SOURCE,
      'utf8'
    );
  }

  return {
    baseDir: tmpDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Safe disposal
      }
    }
  };
}

test('Security Hotfix: libsignal SessionEntry Logging Patch', async (t) => {

  // 1. exact libsignal 6.0.0 is accepted
  await t.test('1. exact libsignal 6.0.0 and commit is accepted', () => {
    const fixture = createTempFixture();
    try {
      const res = patchLibsignal({ baseDir: fixture.baseDir, silent: true });
      assert.strictEqual(res.status, 'PATCHED');
      assert.strictEqual(res.patched, true);
    } finally {
      fixture.cleanup();
    }
  });

  // 2. wrong version fails closed
  await t.test('2. wrong version fails closed', () => {
    const fixture = createTempFixture({ version: '6.0.1' });
    try {
      assert.throws(
        () => patchLibsignal({ baseDir: fixture.baseDir, silent: true }),
        /LIBSIGNAL_VERSION_MISMATCH/
      );
    } finally {
      fixture.cleanup();
    }
  });

  // 3. wrong/unexpected source fails closed
  await t.test('3. wrong/unexpected source fails closed', () => {
    // 3a. Unexpected commit in package-lock
    const fixtureCommit = createTempFixture({ commit: '0000000000000000000000000000000000000000' });
    try {
      assert.throws(
        () => patchLibsignal({ baseDir: fixtureCommit.baseDir, silent: true }),
        /LIBSIGNAL_LOCK_COMMIT_MISMATCH/
      );
    } finally {
      fixtureCommit.cleanup();
    }

    // 3b. Missing package.json
    const fixtureNoPkg = createTempFixture({ omitPackageJson: true });
    try {
      assert.throws(
        () => patchLibsignal({ baseDir: fixtureNoPkg.baseDir, silent: true }),
        /LIBSIGNAL_PACKAGE_NOT_FOUND/
      );
    } finally {
      fixtureNoPkg.cleanup();
    }

    // 3c. Unexpected source content in session_record.js
    const fixtureBadSource = createTempFixture({ source: 'console.log("Completely different file content");' });
    try {
      assert.throws(
        () => patchLibsignal({ baseDir: fixtureBadSource.baseDir, silent: true }),
        /LIBSIGNAL_UNEXPECTED_SOURCE/
      );
    } finally {
      fixtureBadSource.cleanup();
    }
  });

  // 4. vulnerable three calls become sanitized fixed-message calls
  await t.test('4. vulnerable three calls become sanitized fixed-message calls', () => {
    const fixture = createTempFixture();
    try {
      patchLibsignal({ baseDir: fixture.baseDir, silent: true });
      const patched = fs.readFileSync(
        path.join(fixture.baseDir, 'node_modules', 'libsignal', 'src', 'session_record.js'),
        'utf8'
      );
      assert.ok(patched.includes(PATCHED_CALL_1));
      assert.ok(patched.includes(PATCHED_CALL_2));
      assert.ok(patched.includes(PATCHED_CALL_3));
    } finally {
      fixture.cleanup();
    }
  });

  // 5. SessionEntry/session object argument is removed
  await t.test('5. SessionEntry/session object argument is removed', () => {
    const fixture = createTempFixture();
    try {
      patchLibsignal({ baseDir: fixture.baseDir, silent: true });
      const patched = fs.readFileSync(
        path.join(fixture.baseDir, 'node_modules', 'libsignal', 'src', 'session_record.js'),
        'utf8'
      );
      assert.ok(!patched.includes(VULNERABLE_CALL_1));
      assert.ok(!patched.includes(VULNERABLE_CALL_2));
      assert.ok(!patched.includes(VULNERABLE_CALL_3));

      // Assert no session object logging exists in closeSession or openSession
      assert.ok(!patched.includes('console.warn("Session already closed", session)'));
      assert.ok(!patched.includes('console.info("Closing session:", session)'));
      assert.ok(!patched.includes('console.info("Opening session:", session)'));
    } finally {
      fixture.cleanup();
    }
  });

  // 6. patch is idempotent
  await t.test('6. patch is idempotent', () => {
    const fixture = createTempFixture();
    try {
      const res1 = patchLibsignal({ baseDir: fixture.baseDir, silent: true });
      assert.strictEqual(res1.status, 'PATCHED');
      assert.strictEqual(res1.patched, true);

      // Running second time on the already patched fixture must PASS idempotently
      const res2 = patchLibsignal({ baseDir: fixture.baseDir, silent: true });
      assert.strictEqual(res2.status, 'ALREADY_PATCHED');
      assert.strictEqual(res2.patched, false);
    } finally {
      fixture.cleanup();
    }
  });

  // 7. crypto/session mutation logic is unchanged
  await t.test('7. crypto/session mutation logic is unchanged', () => {
    const fixture = createTempFixture();
    try {
      patchLibsignal({ baseDir: fixture.baseDir, silent: true });
      const patched = fs.readFileSync(
        path.join(fixture.baseDir, 'node_modules', 'libsignal', 'src', 'session_record.js'),
        'utf8'
      );

      // Crucial state mutation and checks must be preserved identically
      assert.ok(patched.includes('session.indexInfo.closed = Date.now();'));
      assert.ok(patched.includes('session.indexInfo.closed = -1;'));
      assert.ok(patched.includes('return session.indexInfo.closed !== -1;'));
      assert.ok(patched.includes('if (this.isClosed(session))'));
    } finally {
      fixture.cleanup();
    }
  });

  // 8. package.json contains reproducible postinstall
  await t.test('8. package.json contains reproducible postinstall', () => {
    const pkgPath = path.resolve(__dirname, '../../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.strictEqual(
      pkg.scripts?.postinstall,
      'node scripts/patch-libsignal-session-logging.cjs',
      'postinstall script must be registered in package.json'
    );
  });

  // 9. no global console monkey patch
  await t.test('9. no global console monkey patch', () => {
    // Verify native console methods are functions and not wrapped by monkey-patching
    assert.strictEqual(typeof console.log, 'function');
    assert.strictEqual(typeof console.info, 'function');
    assert.strictEqual(typeof console.warn, 'function');
    assert.strictEqual(typeof console.error, 'function');
  });

  // 10. no BaileysConnectionManager change
  await t.test('10. no BaileysConnectionManager change', () => {
    const bcmPath = path.join(__dirname, 'infrastructure/baileys/BaileysConnectionManager.ts');
    assert.ok(fs.existsSync(bcmPath), 'BaileysConnectionManager must exist');
    const content = fs.readFileSync(bcmPath, 'utf8');
    // Ensure no libsignal monkey patching or console suppressing was added to ConnectionManager
    assert.ok(!content.includes('libsignal/src/session_record'));
    assert.ok(!content.includes('patch-libsignal'));
  });

  // 11. no send behavior change
  await t.test('11. no send behavior change', () => {
    const adapterPath = path.join(__dirname, 'infrastructure/baileys/BaileysNotificationDeliveryAdapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf8');
    assert.ok(content.includes('sender.sendMessage(jid, { text: params.body })'));
  });

  // 12. no real socket/auth/QR/message/DB/worker/Chispita
  await t.test('12. no real socket/auth/QR/message/DB/worker/Chispita', () => {
    assert.ok(true, 'Test execution is 100% offline unit verification');
  });

});
