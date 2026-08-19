import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { prisma } from '../../../infrastructure/database/prisma';
import { AuthService } from './AuthService';
import { CryptoService } from '../infrastructure/CryptoService';

const scryptAsync = promisify(crypto.scrypt);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CLINIC_ID = '22222222-2222-4222-8222-222222222222';

async function makeLegacyV1Hash(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;

  return `v1:${salt}:${derived.toString('hex')}`;
}

function installDbStubs(passwordHash: string) {
  const userDelegate = prisma.user as any;
  const sessionDelegate = prisma.session as any;
  const auditDelegate = prisma.auditEvent as any;

  const originals = {
    userFindUnique: userDelegate.findUnique,
    userUpdateMany: userDelegate.updateMany,
    userUpdate: userDelegate.update,
    sessionCreate: sessionDelegate.create,
    auditCreate: auditDelegate.create,
  };

  let updateManyCalls = 0;
  let upgradedPasswordHash: string | undefined;

  userDelegate.findUnique = async (args: any) => {
    if (args?.select?.passwordHash) {
      return { passwordHash: upgradedPasswordHash ?? passwordHash };
    }

    return {
      id: USER_ID,
      email: 'owner@example.test',
      passwordHash,
      firstName: 'Owner',
      lastName: 'Test',
      status: 'ACTIVE',
      memberships: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          userId: USER_ID,
          clinicId: CLINIC_ID,
          role: 'OWNER',
          status: 'ACTIVE',
          clinic: {
            id: CLINIC_ID,
            name: 'Test Clinic',
          },
        },
      ],
    };
  };

  userDelegate.updateMany = async (args: any) => {
    updateManyCalls += 1;

    assert.equal(args.where.id, USER_ID);
    assert.equal(args.where.passwordHash, passwordHash);

    upgradedPasswordHash = args.data.passwordHash;

    return { count: 1 };
  };

  userDelegate.update = async () => ({ id: USER_ID });

  sessionDelegate.create = async (args: any) => ({
    id: '44444444-4444-4444-8444-444444444444',
    ...args.data,
  });

  auditDelegate.create = async () => ({
    id: '55555555-5555-4555-8555-555555555555',
  });

  return {
    getUpdateManyCalls: () => updateManyCalls,
    getUpgradedPasswordHash: () => upgradedPasswordHash,

    restore() {
      userDelegate.findUnique = originals.userFindUnique;
      userDelegate.updateMany = originals.userUpdateMany;
      userDelegate.update = originals.userUpdate;
      sessionDelegate.create = originals.sessionCreate;
      auditDelegate.create = originals.auditCreate;
    },
  };
}

test('AuthService.login actualiza transparentemente un hash v1 a v2', async () => {
  const password = 'LegacyPassword123!';
  const legacyHash = await makeLegacyV1Hash(password);
  const stubs = installDbStubs(legacyHash);

  try {
    const result = await AuthService.login(
      'owner@example.test',
      password,
      '127.0.0.1',
      'test-agent',
    );

    assert.ok(result.rawToken);
    assert.equal(stubs.getUpdateManyCalls(), 1);

    const upgradedHash = stubs.getUpgradedPasswordHash();

    assert.ok(upgradedHash);
    assert.ok(upgradedHash.startsWith('v2:16384:8:5:'));
    assert.equal(
      await CryptoService.verifyPassword(password, upgradedHash),
      true,
    );
  } finally {
    stubs.restore();
  }
});

test('AuthService.login no recalcula una contraseña que ya está en v2', async () => {
  const password = 'CurrentPassword123!';
  const currentHash = await CryptoService.hashPassword(password);
  const stubs = installDbStubs(currentHash);

  try {
    const result = await AuthService.login(
      'owner@example.test',
      password,
      '127.0.0.1',
      'test-agent',
    );

    assert.ok(result.rawToken);
    assert.equal(stubs.getUpdateManyCalls(), 0);
    assert.equal(stubs.getUpgradedPasswordHash(), undefined);
  } finally {
    stubs.restore();
  }
});

test('AuthService.login permite autenticar y actualizar una contraseña legacy menor de 12 caracteres', async () => {
  const password = 'legacy8!'; // 8 caracteres, válido en v1
  const legacyHash = await makeLegacyV1Hash(password);
  const stubs = installDbStubs(legacyHash);

  try {
    const result = await AuthService.login(
      'owner@example.test',
      password,
      '127.0.0.1',
      'test-agent',
    );

    assert.ok(result.rawToken);
    assert.equal(stubs.getUpdateManyCalls(), 1);

    const upgradedHash = stubs.getUpgradedPasswordHash();
    assert.ok(upgradedHash);
    assert.equal(await CryptoService.verifyPassword(password, upgradedHash), true);
  } finally {
    stubs.restore();
  }
});
