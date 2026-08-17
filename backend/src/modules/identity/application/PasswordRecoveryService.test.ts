import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../infrastructure/database/prisma';
import { CryptoService } from '../infrastructure/CryptoService';
import { PasswordRecoveryService } from './PasswordRecoveryService';
import {
  PasswordResetEmailMessage,
  TransactionalEmailService,
} from '../infrastructure/TransactionalEmailService';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_ID = '22222222-2222-4222-8222-222222222222';

const allowCompromiseCheck = async (_password: string): Promise<void> => {};

function installPrismaStubs() {
  const root = prisma as any;

  const userDelegate = prisma.user as any;
  const resetDelegate = prisma.passwordResetToken as any;

  const originals = {
    transaction: root.$transaction,
    userFindUnique: userDelegate.findUnique,
    resetFindUnique: resetDelegate.findUnique,
  };

  const calls = {
    invalidatedBeforeCreate: 0,
    createdTokenHash: undefined as string | undefined,
    createdExpiresAt: undefined as Date | undefined,
    auditActions: [] as string[],
    auditActors: [] as Array<string | null>,
    consumeExpiresAfter: undefined as Date | undefined,
    consumed: 0,
    passwordHash: undefined as string | undefined,
    invalidatedOtherTokens: 0,
    revokedSessions: 0,
  };

  const tx = {
    passwordResetToken: {
      updateMany: async (args: any) => {
        if (args.where?.id === TOKEN_ID) {
          calls.consumed += 1;
          calls.consumeExpiresAfter = args.where?.expiresAt?.gt;
          return { count: 1 };
        }

        if (args.where?.id?.not === TOKEN_ID) {
          calls.invalidatedOtherTokens += 1;
          return { count: 1 };
        }

        calls.invalidatedBeforeCreate += 1;
        return { count: 1 };
      },

      create: async (args: any) => {
        calls.createdTokenHash = args.data.tokenHash;
        calls.createdExpiresAt = args.data.expiresAt;

        return {
          id: TOKEN_ID,
          ...args.data,
        };
      },
    },

    user: {
      update: async (args: any) => {
        calls.passwordHash = args.data.passwordHash;
        return { id: USER_ID };
      },
    },

    session: {
      updateMany: async () => {
        calls.revokedSessions += 1;
        return { count: 2 };
      },
    },

    auditEvent: {
      create: async (args: any) => {
        calls.auditActions.push(args.data.action);
        calls.auditActors.push(args.data.actorUserId ?? null);
        return { id: '33333333-3333-4333-8333-333333333333' };
      },
    },
  };

  root.$transaction = async (callback: any) => callback(tx);

  return {
    calls,
    setUser(user: any) {
      userDelegate.findUnique = async () => user;
    },
    setToken(token: any) {
      resetDelegate.findUnique = async () => token;
    },
    setConsumeCount(count: number) {
      tx.passwordResetToken.updateMany = async (args: any) => {
        if (args.where?.id === TOKEN_ID) {
          calls.consumed += 1;
          calls.consumeExpiresAfter = args.where?.expiresAt?.gt;
          return { count };
        }

        if (args.where?.id?.not === TOKEN_ID) {
          calls.invalidatedOtherTokens += 1;
          return { count: 1 };
        }

        calls.invalidatedBeforeCreate += 1;
        return { count: 1 };
      };
    },
    restore() {
      root.$transaction = originals.transaction;
      userDelegate.findUnique = originals.userFindUnique;
      resetDelegate.findUnique = originals.resetFindUnique;
    },
  };
}

test('requestReset crea solo hash persistido y entrega el token crudo fuera de BD', async () => {
  const stubs = installPrismaStubs();

  stubs.setUser({
    id: USER_ID,
    email: 'owner@example.test',
    firstName: 'Owner',
    status: 'ACTIVE',
  });

  let delivery: PasswordResetEmailMessage | undefined;

  const emailService: TransactionalEmailService = {
    async sendPasswordReset(message) {
      delivery = message;
    },
  };

  try {
    await PasswordRecoveryService.requestReset(
      '  OWNER@EXAMPLE.TEST ',
      emailService,
    );

    assert.ok(delivery);
    assert.equal(delivery.to, 'owner@example.test');

    const url = new URL(delivery.resetUrl);
    const rawToken = url.searchParams.get('token');

    assert.equal(url.origin, new URL(process.env.APP_ORIGIN ?? 'http://localhost:3000').origin);
    assert.equal(url.pathname, '/reset-password');

    assert.ok(rawToken);
    assert.ok(rawToken.length > 20);

    assert.equal(stubs.calls.invalidatedBeforeCreate, 1);
    assert.ok(stubs.calls.createdTokenHash);
    assert.notEqual(stubs.calls.createdTokenHash, rawToken);

    assert.equal(
      stubs.calls.createdTokenHash,
      CryptoService.hashPasswordResetToken(rawToken),
    );

    assert.deepEqual(
      stubs.calls.auditActions,
      ['PASSWORD_RESET_REQUESTED'],
    );
    assert.deepEqual(stubs.calls.auditActors, [null]);
  } finally {
    stubs.restore();
  }
});

test('requestReset no entrega token ni crea credencial cuando el email no existe', async () => {
  const stubs = installPrismaStubs();
  stubs.setUser(null);

  let delivered = false;

  const emailService: TransactionalEmailService = {
    async sendPasswordReset() {
      delivered = true;
    },
  };

  try {
    await PasswordRecoveryService.requestReset(
      'missing@example.test',
      emailService,
    );

    assert.equal(delivered, false);
    assert.equal(stubs.calls.invalidatedBeforeCreate, 0);
    assert.equal(stubs.calls.createdTokenHash, undefined);
  } finally {
    stubs.restore();
  }
});

test('resetPassword consume token, cambia a hash v2 y revoca todas las sesiones', async () => {
  const stubs = installPrismaStubs();
  const rawToken = CryptoService.generatePasswordResetToken();

  stubs.setToken({
    id: TOKEN_ID,
    userId: USER_ID,
    usedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  try {
    await PasswordRecoveryService.resetPassword(
      rawToken,
      'NewSecurePassword123!',
      allowCompromiseCheck,
    );

    assert.equal(stubs.calls.consumed, 1);
    assert.equal(stubs.calls.invalidatedOtherTokens, 1);
    assert.equal(stubs.calls.revokedSessions, 1);

    assert.ok(stubs.calls.passwordHash);
    assert.ok(stubs.calls.passwordHash.startsWith('v2:16384:8:5:'));

    assert.equal(
      await CryptoService.verifyPassword(
        'NewSecurePassword123!',
        stubs.calls.passwordHash,
      ),
      true,
    );

    assert.deepEqual(
      stubs.calls.auditActions,
      ['PASSWORD_RESET_COMPLETED'],
    );
  } finally {
    stubs.restore();
  }
});

test('resetPassword rechaza contraseña comprometida antes de scrypt y sin consumir token', async () => {
  const stubs = installPrismaStubs();
  const rawToken = CryptoService.generatePasswordResetToken();

  stubs.setToken({
    id: TOKEN_ID,
    userId: USER_ID,
    usedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  const originalHashPassword = CryptoService.hashPassword;
  let compromiseChecks = 0;
  let hashCalls = 0;

  (CryptoService as any).hashPassword = async () => {
    hashCalls += 1;
    return 'v2:should-not-be-created';
  };

  try {
    await assert.rejects(
      PasswordRecoveryService.resetPassword(
        rawToken,
        'CompromisedPassword123!',
        async () => {
          compromiseChecks += 1;

          const error = Object.assign(
            new Error('compromised password'),
            { code: 'COMPROMISED_PASSWORD' },
          );

          throw error;
        },
      ),
      (error: any) => error?.code === 'COMPROMISED_PASSWORD',
    );

    assert.equal(compromiseChecks, 1);
    assert.equal(hashCalls, 0);
    assert.equal(stubs.calls.consumed, 0);
    assert.equal(stubs.calls.invalidatedOtherTokens, 0);
    assert.equal(stubs.calls.revokedSessions, 0);
  } finally {
    (CryptoService as any).hashPassword = originalHashPassword;
    stubs.restore();
  }
});

test('resetPassword evalúa expiración nuevamente después de scrypt', async () => {
  const stubs = installPrismaStubs();
  const rawToken = CryptoService.generatePasswordResetToken();

  stubs.setToken({
    id: TOKEN_ID,
    userId: USER_ID,
    usedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  const originalHashPassword = CryptoService.hashPassword;
  let hashFinishedAt = 0;

  (CryptoService as any).hashPassword = async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    hashFinishedAt = Date.now();
    return 'v2:test-hash';
  };

  try {
    await PasswordRecoveryService.resetPassword(
      rawToken,
      'NewSecurePassword123!',
      allowCompromiseCheck,
    );

    assert.ok(stubs.calls.consumeExpiresAfter);
    assert.ok(
      stubs.calls.consumeExpiresAfter.getTime() >= hashFinishedAt,
      'la comparación de expiresAt debe usar una hora posterior a scrypt',
    );
  } finally {
    (CryptoService as any).hashPassword = originalHashPassword;
    stubs.restore();
  }
});

test('resetPassword rechaza un token expirado antes de abrir transacción sensible', async () => {
  const stubs = installPrismaStubs();

  stubs.setToken({
    id: TOKEN_ID,
    userId: USER_ID,
    usedAt: null,
    expiresAt: new Date(Date.now() - 1_000),
  });

  try {
    await assert.rejects(
      PasswordRecoveryService.resetPassword(
        'expired-token',
        'NewSecurePassword123!',
        allowCompromiseCheck,
      ),
      (error: any) => error?.code === 'INVALID_RESET_TOKEN',
    );

    assert.equal(stubs.calls.consumed, 0);
    assert.equal(stubs.calls.revokedSessions, 0);
  } finally {
    stubs.restore();
  }
});

test('resetPassword rechaza un token ya utilizado', async () => {
  const stubs = installPrismaStubs();

  stubs.setToken({
    id: TOKEN_ID,
    userId: USER_ID,
    usedAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  try {
    await assert.rejects(
      PasswordRecoveryService.resetPassword(
        'used-token',
        'NewSecurePassword123!',
        allowCompromiseCheck,
      ),
      (error: any) => error?.code === 'INVALID_RESET_TOKEN',
    );

    assert.equal(stubs.calls.consumed, 0);
  } finally {
    stubs.restore();
  }
});

test('resetPassword rechaza una carrera cuando otro proceso consumió primero el token', async () => {
  const stubs = installPrismaStubs();

  stubs.setToken({
    id: TOKEN_ID,
    userId: USER_ID,
    usedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  stubs.setConsumeCount(0);

  try {
    await assert.rejects(
      PasswordRecoveryService.resetPassword(
        'concurrent-token',
        'NewSecurePassword123!',
        allowCompromiseCheck,
      ),
      (error: any) => error?.code === 'INVALID_RESET_TOKEN',
    );

    assert.equal(stubs.calls.consumed, 1);
    assert.equal(stubs.calls.revokedSessions, 0);
  } finally {
    stubs.restore();
  }
});
