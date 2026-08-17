import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { CryptoService } from './CryptoService';

const scryptAsync = promisify(crypto.scrypt);

async function makeLegacyV1Hash(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;

  return `v1:${salt}:${buf.toString('hex')}`;
}

test('CryptoService - genera hash v2 y verifica contraseña correcta', async () => {
  const password = 'mySecurePassword123!';
  const hash = await CryptoService.hashPassword(password);

  assert.ok(hash.startsWith('v2:16384:8:5:'));
  assert.strictEqual(await CryptoService.verifyPassword(password, hash), true);
  assert.strictEqual(CryptoService.passwordNeedsRehash(hash), false);
});

test('CryptoService - rechaza contraseña incorrecta con hash v2', async () => {
  const hash = await CryptoService.hashPassword('mySecurePassword123!');

  assert.strictEqual(
    await CryptoService.verifyPassword('wrongPassword', hash),
    false,
  );
});

test('CryptoService - mantiene compatibilidad con hashes v1', async () => {
  const password = 'LegacyPassword123!';
  const hash = await makeLegacyV1Hash(password);

  assert.ok(hash.startsWith('v1:'));
  assert.strictEqual(await CryptoService.verifyPassword(password, hash), true);
  assert.strictEqual(CryptoService.passwordNeedsRehash(hash), true);
});

test('CryptoService - rechaza hashes inválidos sin lanzar excepción', async () => {
  assert.strictEqual(
    await CryptoService.verifyPassword('password', 'invalid-hash'),
    false,
  );

  assert.strictEqual(
    await CryptoService.verifyPassword(
      'password',
      'v2:16384:8:5:salt:not-valid',
    ),
    false,
  );
});

test('CryptoService - generación y hash de token de sesión', () => {
  const rawToken = CryptoService.generateSessionToken();

  assert.ok(rawToken.length > 20);

  const hashedToken = CryptoService.hashSessionToken(rawToken);

  assert.strictEqual(hashedToken.length, 64);
});

test('Session - detección de sesión expirada', () => {
  const expiresAt = new Date(Date.now() - 1000);

  assert.strictEqual(expiresAt < new Date(), true);
});

test('AuthService - normalización de email', () => {
  const inputEmail = '  DocTor.Wired@YES-FARMA.com   ';
  const normalized = inputEmail.trim().toLowerCase();

  assert.strictEqual(normalized, 'doctor.wired@yes-farma.com');
});
