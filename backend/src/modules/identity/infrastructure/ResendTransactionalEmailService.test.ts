import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ResendFetch,
  ResendTransactionalEmailService,
} from './ResendTransactionalEmailService';

const message = {
  to: 'owner@example.test',
  firstName: 'Owner',
  resetUrl:
    'https://app.example.test/reset-password?token=very-secret-reset-token',
  expiresAt: new Date(Date.now() + 30 * 60_000),
};

test('Resend adapter envía password reset con API y formato esperado', async () => {
  let requestedUrl = '';
  let headers: Record<string, string> = {};
  let body = '';

  const fakeFetch: ResendFetch = async (url, init) => {
    requestedUrl = url;
    headers = init.headers;
    body = init.body;

    return {
      ok: true,
      status: 200,
    };
  };

  const service = new ResendTransactionalEmailService(
    {
      apiKey: 're_test_secret',
      from: 'Yes Farma <no-reply@example.test>',
    },
    fakeFetch,
  );

  await service.sendPasswordReset(message);

  assert.equal(
    requestedUrl,
    'https://api.resend.com/emails',
  );

  assert.equal(
    headers.Authorization,
    'Bearer re_test_secret',
  );

  assert.equal(
    headers['Content-Type'],
    'application/json',
  );

  const idempotencyKey = headers['Idempotency-Key'];

  assert.ok(idempotencyKey);

  assert.match(
    idempotencyKey,
    /^[a-f0-9]{64}$/,
  );

  assert.equal(
    idempotencyKey.includes(
      'very-secret-reset-token',
    ),
    false,
  );

  const payload = JSON.parse(body);

  assert.equal(
    payload.from,
    'Yes Farma <no-reply@example.test>',
  );

  assert.deepEqual(
    payload.to,
    ['owner@example.test'],
  );

  assert.equal(
    payload.subject,
    'Restablece tu contraseña de Yes Farma',
  );

  assert.ok(
    payload.text.includes(message.resetUrl),
  );

  assert.ok(
    payload.html.includes('Restablecer contraseña'),
  );

  assert.ok(
    payload.html.includes(
      'very-secret-reset-token',
    ),
  );
});

test('Resend adapter escapa contenido HTML dinámico', async () => {
  let body = '';

  const fakeFetch: ResendFetch = async (_url, init) => {
    body = init.body;

    return {
      ok: true,
      status: 200,
    };
  };

  const service = new ResendTransactionalEmailService(
    {
      apiKey: 're_test_secret',
      from: 'Yes Farma <no-reply@example.test>',
    },
    fakeFetch,
  );

  await service.sendPasswordReset({
    ...message,
    firstName: '<script>alert("x")</script>',
  });

  const payload = JSON.parse(body);

  assert.equal(
    payload.html.includes('<script>'),
    false,
  );

  assert.ok(
    payload.html.includes('&lt;script&gt;'),
  );
});

test('Resend adapter usa una idempotency key estable para el mismo mensaje', async () => {
  const keys: string[] = [];

  const fakeFetch: ResendFetch = async (_url, init) => {
    const idempotencyKey = init.headers['Idempotency-Key'];
    assert.ok(idempotencyKey);
    keys.push(idempotencyKey);

    return {
      ok: true,
      status: 200,
    };
  };

  const service = new ResendTransactionalEmailService(
    {
      apiKey: 're_test_secret',
      from: 'Yes Farma <no-reply@example.test>',
    },
    fakeFetch,
  );

  await service.sendPasswordReset(message);
  await service.sendPasswordReset(message);

  assert.equal(keys.length, 2);

  const firstKey = keys[0];
  const secondKey = keys[1];

  assert.ok(firstKey);
  assert.ok(secondKey);
  assert.equal(firstKey, secondKey);
});

test('Resend adapter falla cerrado ante error HTTP', async () => {
  const fakeFetch: ResendFetch = async () => ({
    ok: false,
    status: 503,
  });

  const service = new ResendTransactionalEmailService(
    {
      apiKey: 're_test_secret',
      from: 'Yes Farma <no-reply@example.test>',
    },
    fakeFetch,
  );

  await assert.rejects(
    service.sendPasswordReset(message),
    (error: any) =>
      error?.code === 'EMAIL_DELIVERY_UNAVAILABLE',
  );
});

test(
  'Resend adapter corta una petición colgada por timeout',
  { timeout: 500 },
  async () => {
    let aborted = false;

    const fakeFetch: ResendFetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('aborted'));
          },
          { once: true },
        );
      });

    const service = new ResendTransactionalEmailService(
      {
        apiKey: 're_test_secret',
        from: 'Yes Farma <no-reply@example.test>',
        timeoutMs: 20,
      },
      fakeFetch,
    );

    await assert.rejects(
      service.sendPasswordReset(message),
      (error: any) =>
        error?.code === 'EMAIL_DELIVERY_UNAVAILABLE',
    );

    assert.equal(aborted, true);
  },
);
