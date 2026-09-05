const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_VERSION = '6.0.0';
const REQUIRED_COMMIT = 'bcea72df9ec34d9d9140ab30619cf479c7c144c7';

const VULNERABLE_CALL_1 = 'console.warn("Session already closed", session);';
const VULNERABLE_CALL_2 = 'console.info("Closing session:", session);';
const VULNERABLE_CALL_3 = 'console.info("Opening session:", session);';

const PATCHED_CALL_1 = 'console.warn("Session already closed");';
const PATCHED_CALL_2 = 'console.info("Closing session");';
const PATCHED_CALL_3 = 'console.info("Opening session");';

function patchLibsignal(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, '..');
  const silent = Boolean(options.silent);

  const log = (msg) => {
    if (!silent) console.log(msg);
  };

  // 1. Verify node_modules/libsignal/package.json exists
  const libsignalPkgPath = path.join(baseDir, 'node_modules', 'libsignal', 'package.json');
  if (!fs.existsSync(libsignalPkgPath)) {
    throw new Error(`LIBSIGNAL_PACKAGE_NOT_FOUND: ${libsignalPkgPath} does not exist`);
  }

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(libsignalPkgPath, 'utf8'));
  } catch {
    throw new Error(`LIBSIGNAL_PACKAGE_PARSE_ERROR: Failed to parse ${libsignalPkgPath}`);
  }

  // 2. Verify version is exactly 6.0.0
  if (pkg.version !== REQUIRED_VERSION) {
    throw new Error(`LIBSIGNAL_VERSION_MISMATCH: Expected version ${REQUIRED_VERSION}, found ${pkg.version}`);
  }

  // 3. Verify package-lock.json resolved commit contains bcea72df9ec34d9d9140ab30619cf479c7c144c7
  const packageLockPath = path.join(baseDir, 'package-lock.json');
  if (!fs.existsSync(packageLockPath)) {
    throw new Error(`PACKAGE_LOCK_NOT_FOUND: ${packageLockPath} does not exist`);
  }

  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  } catch {
    throw new Error(`PACKAGE_LOCK_PARSE_ERROR: Failed to parse ${packageLockPath}`);
  }

  const lockEntry = (lock.packages && lock.packages['node_modules/libsignal']) ||
                    (lock.dependencies && lock.dependencies['libsignal']);

  if (!lockEntry || typeof lockEntry.resolved !== 'string') {
    throw new Error('LIBSIGNAL_LOCK_ENTRY_NOT_FOUND: node_modules/libsignal entry missing in package-lock.json');
  }

  if (!lockEntry.resolved.includes(REQUIRED_COMMIT)) {
    throw new Error(`LIBSIGNAL_LOCK_COMMIT_MISMATCH: Expected commit ${REQUIRED_COMMIT} in resolved URL, found ${lockEntry.resolved}`);
  }

  // 4. Verify session_record.js exists
  const sessionRecordPath = path.join(baseDir, 'node_modules', 'libsignal', 'src', 'session_record.js');
  if (!fs.existsSync(sessionRecordPath)) {
    throw new Error(`SESSION_RECORD_NOT_FOUND: ${sessionRecordPath} does not exist`);
  }

  const content = fs.readFileSync(sessionRecordPath, 'utf8');

  // 5. Check if already patched (idempotence)
  const hasPatched1 = content.includes(PATCHED_CALL_1);
  const hasPatched2 = content.includes(PATCHED_CALL_2);
  const hasPatched3 = content.includes(PATCHED_CALL_3);
  const hasVulnerable1 = content.includes(VULNERABLE_CALL_1);
  const hasVulnerable2 = content.includes(VULNERABLE_CALL_2);
  const hasVulnerable3 = content.includes(VULNERABLE_CALL_3);

  if (hasPatched1 && hasPatched2 && hasPatched3 && !hasVulnerable1 && !hasVulnerable2 && !hasVulnerable3) {
    log('libsignal session logging already patched (idempotent PASS).');
    return {
      status: 'ALREADY_PATCHED',
      patched: false,
      targetFile: sessionRecordPath
    };
  }

  // 6. Verify all expected vulnerable calls are present
  if (!hasVulnerable1 || !hasVulnerable2 || !hasVulnerable3) {
    throw new Error('LIBSIGNAL_UNEXPECTED_SOURCE: session_record.js does not match expected vulnerable pattern or is partially corrupted');
  }

  // 7. Perform replacement
  let patchedContent = content;
  patchedContent = patchedContent.replace(VULNERABLE_CALL_1, PATCHED_CALL_1);
  patchedContent = patchedContent.replace(VULNERABLE_CALL_2, PATCHED_CALL_2);
  patchedContent = patchedContent.replace(VULNERABLE_CALL_3, PATCHED_CALL_3);

  // Safety assertions on the result
  if (
    patchedContent.includes(VULNERABLE_CALL_1) ||
    patchedContent.includes(VULNERABLE_CALL_2) ||
    patchedContent.includes(VULNERABLE_CALL_3) ||
    !patchedContent.includes(PATCHED_CALL_1) ||
    !patchedContent.includes(PATCHED_CALL_2) ||
    !patchedContent.includes(PATCHED_CALL_3)
  ) {
    throw new Error('LIBSIGNAL_PATCH_VERIFICATION_FAILED: Replacement produced invalid content');
  }

  fs.writeFileSync(sessionRecordPath, patchedContent, 'utf8');
  log('Successfully patched libsignal session logging in ' + sessionRecordPath);

  return {
    status: 'PATCHED',
    patched: true,
    targetFile: sessionRecordPath
  };
}

if (require.main === module) {
  try {
    patchLibsignal();
    process.exit(0);
  } catch (err) {
    console.error('PATCH_LIBSIGNAL_FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

module.exports = {
  patchLibsignal,
  REQUIRED_VERSION,
  REQUIRED_COMMIT,
  VULNERABLE_CALL_1,
  VULNERABLE_CALL_2,
  VULNERABLE_CALL_3,
  PATCHED_CALL_1,
  PATCHED_CALL_2,
  PATCHED_CALL_3
};
