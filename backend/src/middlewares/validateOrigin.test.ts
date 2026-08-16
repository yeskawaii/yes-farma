import test from 'node:test';
import assert from 'node:assert';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/AppError';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/yesfarma_test';
process.env.APP_ORIGIN = 'https://yes-farma.test';
process.env.NODE_ENV = 'test';

const { validateOrigin } = require('./validateOrigin');

const appOrigin = process.env.APP_ORIGIN;

const runMiddleware = (
  method: string,
  headers: Record<string, string | undefined>
): unknown => {
  const req = {
    method,
    headers,
  } as unknown as Request;

  const res = {} as Response;

  let nextValue: unknown;

  const next: NextFunction = ((value?: unknown) => {
    nextValue = value;
  }) as NextFunction;

  validateOrigin(req, res, next);

  return nextValue;
};

test('validateOrigin permite POST desde APP_ORIGIN', () => {
  const result = runMiddleware('POST', {
    origin: appOrigin,
  });

  assert.strictEqual(result, undefined);
});

test('validateOrigin rechaza origen con prefijo similar pero host distinto', () => {
  const allowed = new URL(appOrigin);
  const maliciousOrigin = `${allowed.protocol}//${allowed.hostname}.evil.example`;

  const result = runMiddleware('POST', {
    origin: maliciousOrigin,
  });

  assert.ok(result instanceof AppError);
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(result.code, 'INVALID_ORIGIN');
});

test('validateOrigin rechaza mutación sin Origin ni Referer', () => {
  const result = runMiddleware('PATCH', {});

  assert.ok(result instanceof AppError);
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(result.code, 'INVALID_ORIGIN');
});

test('validateOrigin permite GET sin Origin ni Referer', () => {
  const result = runMiddleware('GET', {});

  assert.strictEqual(result, undefined);
});

test('validateOrigin permite Referer del mismo origen', () => {
  const referer = new URL('/patients/123', appOrigin).toString();

  const result = runMiddleware('DELETE', {
    referer,
  });

  assert.strictEqual(result, undefined);
});
