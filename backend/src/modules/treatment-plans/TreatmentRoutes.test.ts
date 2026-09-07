import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { once } from 'node:events';
import { createTreatmentRoutes } from './infrastructure/treatmentRoutes';
import { errorHandler } from '../../shared/errors/errorHandler';

test('all treatment, catalog and budget endpoints require a session', async () => {
  const app = express(); app.use(express.json(), cookieParser(), createTreatmentRoutes(), errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    for (const [method, path] of [
      ['GET', '/dental-procedures'], ['POST', '/dental-procedures'], ['PATCH', '/dental-procedures/id'],
      ['GET', '/patients/id/treatment-plan'], ['POST', '/patients/id/treatments'], ['PATCH', '/patients/id/treatments/id'],
      ['POST', '/patients/id/budgets'], ['PATCH', '/patients/id/budgets/id'],
    ]) {
      const response: Awaited<ReturnType<typeof fetch>> = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: method! });
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
    }
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
