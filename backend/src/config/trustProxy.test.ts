import test from 'node:test';
import assert from 'node:assert/strict';
import { trustProxySchema } from './trustProxy';

test('TRUST_PROXY parser tests', () => {
  // - ausente -> usar default actual apropiado ('0')
  assert.equal(trustProxySchema.parse(undefined), 0);

  // - "" -> trust proxy desactivado (0)
  assert.equal(trustProxySchema.parse(''), 0);

  // - "0" -> 0/desactivado
  assert.equal(trustProxySchema.parse('0'), 0);

  // - "false" -> 0/desactivado
  assert.equal(trustProxySchema.parse('false'), 0);

  // - entero positivo ("1", "2", etc.) -> número exacto de hops
  assert.equal(trustProxySchema.parse('1'), 1);
  assert.equal(trustProxySchema.parse('2'), 2);
  assert.equal(trustProxySchema.parse('10'), 10);

  // - "true" -> INVÁLIDO
  assert.throws(() => trustProxySchema.parse('true'));

  // - negativos -> INVÁLIDOS
  assert.throws(() => trustProxySchema.parse('-1'));

  // - decimales -> INVÁLIDOS
  assert.throws(() => trustProxySchema.parse('1.5'));

  // - texto arbitrario -> INVÁLIDO
  assert.throws(() => trustProxySchema.parse('arbitrary'));
});
