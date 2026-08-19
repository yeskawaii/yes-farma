import crypto from 'node:crypto';
import { env } from '../../../config/env';
import { AppError } from '../../../shared/errors/AppError';

type PwnedPasswordsResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

export type PwnedPasswordsFetch = (
  url: string,
  init: {
    method: 'GET';
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<PwnedPasswordsResponse>;

const unavailableError = () =>
  new AppError(
    'PASSWORD_SECURITY_CHECK_UNAVAILABLE',
    'No pudimos verificar la seguridad de la contraseña. Intenta nuevamente en unos minutos.',
    503,
  );

const compromisedError = () =>
  new AppError(
    'COMPROMISED_PASSWORD',
    'Esa contraseña no es segura. Prueba con una diferente.',
    400,
  );

export class PwnedPasswordService {
  private static readonly RANGE_URL =
    'https://api.pwnedpasswords.com/range/';

  static async assertNotCompromised(
    password: string,
    fetchImpl: PwnedPasswordsFetch = globalThis.fetch as unknown as PwnedPasswordsFetch,
  ): Promise<void> {
    /*
     * SHA-1 se usa EXCLUSIVAMENTE para el protocolo k-anonymity de
     * Pwned Passwords. El almacenamiento de passwords de Yes Farma
     * continúa usando scrypt v2.
     */
    const fullHash = crypto
      .createHash('sha1')
      .update(password, 'utf8')
      .digest('hex')
      .toUpperCase();

    const prefix = fullHash.slice(0, 5);
    const suffix = fullHash.slice(5);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      env.PWNED_PASSWORDS_TIMEOUT_MS,
    );

    let body: string;

    try {
      const response = await fetchImpl(
        `${PwnedPasswordService.RANGE_URL}${prefix}`,
        {
          method: 'GET',
          headers: {
            'Add-Padding': 'true',
            'User-Agent': 'YesFarma-Password-Security',
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Pwned Passwords HTTP ${response.status}`);
      }

      // El mismo AbortSignal protege también la lectura completa del body.
      body = await response.text();
    } catch {
      throw unavailableError();
    } finally {
      clearTimeout(timeout);
    }

    for (const line of body.split(/\r?\n/)) {
      const separator = line.indexOf(':');

      if (separator === -1) {
        continue;
      }

      const candidateSuffix = line
        .slice(0, separator)
        .trim()
        .toUpperCase();

      const count = Number(line.slice(separator + 1).trim());

      /*
       * Add-Padding puede introducir registros artificiales con count=0.
       * Solo un match real con prevalencia > 0 bloquea la contraseña.
       */
      if (
        candidateSuffix === suffix &&
        Number.isFinite(count) &&
        count > 0
      ) {
        throw compromisedError();
      }
    }
  }
}
