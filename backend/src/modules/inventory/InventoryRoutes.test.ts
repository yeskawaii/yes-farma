import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { once } from 'node:events';
import { createInventoryRoutes } from './infrastructure/inventoryRoutes';
import { errorHandler } from '../../shared/errors/errorHandler';
test('every inventory route requires a session', async () => {
  const app = express(); app.use(express.json(), cookieParser()); app.use('/inventory', createInventoryRoutes()); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try { for (const [method, path] of [['GET', ''], ['POST', '/products'], ['GET', '/products/id'], ['PATCH', '/products/id'], ['POST', '/products/id/movements'], ['POST', '/suppliers'], ['PATCH', '/suppliers/id']]) {
    const response: Awaited<ReturnType<typeof fetch>> = await fetch(`http://127.0.0.1:${address.port}/inventory${path}`, { method: method! }); assert.equal(response.status, 401, `${method} ${path}`); assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
  } } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
