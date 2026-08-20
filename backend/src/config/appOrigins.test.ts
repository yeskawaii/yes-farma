import test from 'node:test';
import assert from 'node:assert';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/yesfarma_test';
process.env.APP_ORIGIN = 'https://salud.yeskira.test';
process.env.APP_ADDITIONAL_ORIGINS = '';
process.env.NODE_ENV = 'test';

const { buildAllowedOrigins } =
  require('./appOrigins') as typeof import('./appOrigins');

test('buildAllowedOrigins conserva el origen canónico cuando no hay adicionales', () => {
  assert.deepStrictEqual(
    buildAllowedOrigins('https://salud.yeskira.com'),
    ['https://salud.yeskira.com'],
  );
});

test('buildAllowedOrigins agrega múltiples orígenes explícitos separados por coma', () => {
  assert.deepStrictEqual(
    buildAllowedOrigins(
      'https://salud.yeskira.com',
      'https://yesfarmaapp.com, https://legacy.example.com',
    ),
    [
      'https://salud.yeskira.com',
      'https://yesfarmaapp.com',
      'https://legacy.example.com',
    ],
  );
});

test('buildAllowedOrigins normaliza URLs a su origen y elimina espacios', () => {
  assert.deepStrictEqual(
    buildAllowedOrigins(
      'https://salud.yeskira.com/login',
      '  https://yesfarmaapp.com/otra-ruta?x=1  ',
    ),
    [
      'https://salud.yeskira.com',
      'https://yesfarmaapp.com',
    ],
  );
});

test('buildAllowedOrigins elimina orígenes duplicados', () => {
  assert.deepStrictEqual(
    buildAllowedOrigins(
      'https://salud.yeskira.com',
      'https://yesfarmaapp.com,https://salud.yeskira.com/,https://yesfarmaapp.com/login',
    ),
    [
      'https://salud.yeskira.com',
      'https://yesfarmaapp.com',
    ],
  );
});

test('buildAllowedOrigins rechaza una URL adicional malformada', () => {
  assert.throws(() =>
    buildAllowedOrigins(
      'https://salud.yeskira.com',
      'esto-no-es-una-url',
    ),
  );
});
