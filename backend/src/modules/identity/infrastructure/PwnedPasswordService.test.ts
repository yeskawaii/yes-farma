import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { env } from '../../../config/env';
import {
  PwnedPasswordService,
  PwnedPasswordsFetch,
} from './PwnedPasswordService';

function hashParts(password: string) {
  const hash = crypto
    .createHash('sha1')
    .update(password, 'utf8')
    .digest('hex')
    .toUpperCase();

  return {
    prefix: hash.slice(0, 5),
    suffix: hash.slice(5),
  };
}

function response(
  body: string,
  status = 200,
): {
  ok: boolean;
  status: number;
  text(): Promise<string>;
} {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
  };
}

test('PwnedPasswordService solo envía el prefijo SHA-1 y solicita padding', async () => {
  const password = 'Una contraseña privada que jamás debe viajar completa';
  const { prefix, suffix } = hashParts(password);

  let requestedUrl = '';
  let requestedHeaders: Record<string, string> = {};

  const fakeFetch: PwnedPasswordsFetch = async (url, init) => {
    requestedUrl = url;
    requestedHeaders = init.headers;

    return response(`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\r\n`);
  };

  await PwnedPasswordService.assertNotCompromised(
    password,
    fakeFetch,
  );

  assert.ok(requestedUrl.endsWith(prefix));
  assert.equal(requestedUrl.includes(password), false);
  assert.equal(requestedUrl.includes(suffix), false);

  assert.equal(requestedHeaders['Add-Padding'], 'true');
  assert.equal(
    requestedHeaders['User-Agent'],
    'YesFarma-Password-Security',
  );
});

test('PwnedPasswordService rechaza coincidencia real comprometida', async () => {
  const password = 'A-realistic-long-password';
  const { suffix } = hashParts(password);

  const fakeFetch: PwnedPasswordsFetch = async () =>
    response(
      [
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3',
        `${suffix}:42`,
        'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:7',
      ].join('\r\n'),
    );

  await assert.rejects(
    PwnedPasswordService.assertNotCompromised(
      password,
      fakeFetch,
    ),
    (error: any) => error?.code === 'COMPROMISED_PASSWORD',
  );
});

test('PwnedPasswordService ignora entradas de padding con count cero', async () => {
  const password = 'Another-long-password-value';
  const { suffix } = hashParts(password);

  const fakeFetch: PwnedPasswordsFetch = async () =>
    response(`${suffix}:0\r\n`);

  await assert.doesNotReject(
    PwnedPasswordService.assertNotCompromised(
      password,
      fakeFetch,
    ),
  );
});

test('PwnedPasswordService acepta contraseña sin coincidencia', async () => {
  const fakeFetch: PwnedPasswordsFetch = async () =>
    response(
      [
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:100',
        'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:200',
      ].join('\r\n'),
    );

  await assert.doesNotReject(
    PwnedPasswordService.assertNotCompromised(
      'A-different-long-password',
      fakeFetch,
    ),
  );
});

test(
  'PwnedPasswordService mantiene el timeout activo durante la lectura del body',
  { timeout: 500 },
  async () => {
    const originalTimeout = env.PWNED_PASSWORDS_TIMEOUT_MS;
    (env as any).PWNED_PASSWORDS_TIMEOUT_MS = 20;

    let observedAbort = false;

    const fakeFetch: PwnedPasswordsFetch = async (_url, init) => ({
      ok: true,
      status: 200,
      text: async () =>
        new Promise<string>((_resolve, reject) => {
          if (init.signal.aborted) {
            observedAbort = true;
            reject(new Error('aborted'));
            return;
          }

          init.signal.addEventListener(
            'abort',
            () => {
              observedAbort = true;
              reject(new Error('aborted'));
            },
            { once: true },
          );
        }),
    });

    try {
      await assert.rejects(
        PwnedPasswordService.assertNotCompromised(
          'A-different-long-password',
          fakeFetch,
        ),
        (error: any) =>
          error?.code === 'PASSWORD_SECURITY_CHECK_UNAVAILABLE',
      );

      assert.equal(observedAbort, true);
    } finally {
      (env as any).PWNED_PASSWORDS_TIMEOUT_MS = originalTimeout;
    }
  },
);

test('PwnedPasswordService falla cerrado ante respuesta HTTP inválida', async () => {
  const fakeFetch: PwnedPasswordsFetch = async () =>
    response('Service unavailable', 503);

  await assert.rejects(
    PwnedPasswordService.assertNotCompromised(
      'A-different-long-password',
      fakeFetch,
    ),
    (error: any) =>
      error?.code === 'PASSWORD_SECURITY_CHECK_UNAVAILABLE',
  );
});

test('PwnedPasswordService falla cerrado ante error de red', async () => {
  const fakeFetch: PwnedPasswordsFetch = async () => {
    throw new Error('network unavailable');
  };

  await assert.rejects(
    PwnedPasswordService.assertNotCompromised(
      'A-different-long-password',
      fakeFetch,
    ),
    (error: any) =>
      error?.code === 'PASSWORD_SECURITY_CHECK_UNAVAILABLE',
  );
});
