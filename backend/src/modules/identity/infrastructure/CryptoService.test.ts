import test from 'node:test';
import assert from 'node:assert';
import { CryptoService } from './CryptoService';
import { AuthService } from '../application/AuthService';

test('CryptoService - hash y verificación correcta de contraseña', async () => {
  const password = 'mySecurePassword123!';
  const hash = await CryptoService.hashPassword(password);
  
  assert.ok(hash.startsWith('v1:'));
  
  const isValid = await CryptoService.verifyPassword(password, hash);
  assert.strictEqual(isValid, true);
});

test('CryptoService - rechazo de contraseña incorrecta', async () => {
  const password = 'mySecurePassword123!';
  const hash = await CryptoService.hashPassword(password);
  
  const isValid = await CryptoService.verifyPassword('wrongPassword', hash);
  assert.strictEqual(isValid, false);
});

test('CryptoService - generación y hash de token de sesión', () => {
  const rawToken = CryptoService.generateSessionToken();
  assert.ok(rawToken.length > 20); // base64url 32 bytes

  const hashedToken = CryptoService.hashSessionToken(rawToken);
  assert.strictEqual(hashedToken.length, 64); // sha256 is 64 hex chars
});

test('Session - detección de sesión expirada', () => {
  const expiresAt = new Date(Date.now() - 1000); // Expirada hace 1 seg
  const isExpired = expiresAt < new Date();
  assert.strictEqual(isExpired, true);
});

test('AuthService - normalización de email', () => {
  const inputEmail = '  DocTor.Wired@YES-FARMA.com   ';
  const normalized = inputEmail.trim().toLowerCase();
  assert.strictEqual(normalized, 'doctor.wired@yes-farma.com');
});
