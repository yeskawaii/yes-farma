import test from 'node:test';
import assert from 'node:assert/strict';
import { PasswordPolicy } from './PasswordPolicy';

test('PasswordPolicy acepta 15 caracteres sin reglas de composición', () => {
  assert.doesNotThrow(() => {
    PasswordPolicy.validateNewPassword('abcdefghijklmn ');
  });
});

test('PasswordPolicy rechaza menos de 15 caracteres', () => {
  assert.throws(
    () => PasswordPolicy.validateNewPassword('short-password'),
    (error: any) => error?.code === 'WEAK_PASSWORD',
  );
});

test('PasswordPolicy acepta hasta 128 caracteres', () => {
  assert.doesNotThrow(() => {
    PasswordPolicy.validateNewPassword('a'.repeat(128));
  });
});

test('PasswordPolicy rechaza más de 128 caracteres', () => {
  assert.throws(
    () => PasswordPolicy.validateNewPassword('a'.repeat(129)),
    (error: any) => error?.code === 'WEAK_PASSWORD',
  );
});
