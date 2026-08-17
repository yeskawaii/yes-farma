import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

const scryptWithOptionsAsync = (
  password: string,
  salt: string,
  keyLength: number,
  options: crypto.ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });

const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_BYTES = 16;

const V2_SCRYPT = {
  N: 16384,
  r: 8,
  p: 5,
  maxmem: 48 * 1024 * 1024,
} as const;

export class CryptoService {
  static async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex');

    const buf = await scryptWithOptionsAsync(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      V2_SCRYPT,
    );

    return [
      'v2',
      String(V2_SCRYPT.N),
      String(V2_SCRYPT.r),
      String(V2_SCRYPT.p),
      salt,
      buf.toString('hex'),
    ].join(':');
  }

  static async verifyPassword(password: string, hashString: string): Promise<boolean> {
    try {
      const parts = hashString.split(':');

      if (parts[0] === 'v1') {
        return await this.verifyV1Password(password, parts);
      }

      if (parts[0] === 'v2') {
        return await this.verifyV2Password(password, parts);
      }

      return false;
    } catch {
      return false;
    }
  }

  static passwordNeedsRehash(hashString: string): boolean {
    const [version, n, r, p] = hashString.split(':');

    return !(
      version === 'v2' &&
      n === String(V2_SCRYPT.N) &&
      r === String(V2_SCRYPT.r) &&
      p === String(V2_SCRYPT.p)
    );
  }

  static generatePasswordResetToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static hashPasswordResetToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static hashSessionToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private static async verifyV1Password(
    password: string,
    parts: string[],
  ): Promise<boolean> {
    const [, salt, key] = parts;

    if (!salt || !key || parts.length !== 3) {
      return false;
    }

    const keyBuf = Buffer.from(key, 'hex');

    if (keyBuf.length !== PASSWORD_KEY_LENGTH) {
      return false;
    }

    const derivedKey = (await scryptAsync(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
    )) as Buffer;

    return crypto.timingSafeEqual(keyBuf, derivedKey);
  }

  private static async verifyV2Password(
    password: string,
    parts: string[],
  ): Promise<boolean> {
    const [, nRaw, rRaw, pRaw, salt, key] = parts;

    if (!nRaw || !rRaw || !pRaw || !salt || !key || parts.length !== 6) {
      return false;
    }

    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);

    if (
      N !== V2_SCRYPT.N ||
      r !== V2_SCRYPT.r ||
      p !== V2_SCRYPT.p
    ) {
      return false;
    }

    const keyBuf = Buffer.from(key, 'hex');

    if (keyBuf.length !== PASSWORD_KEY_LENGTH) {
      return false;
    }

    const derivedKey = await scryptWithOptionsAsync(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      V2_SCRYPT,
    );

    return crypto.timingSafeEqual(keyBuf, derivedKey);
  }
}
