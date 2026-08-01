import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

export class CryptoService {
  static async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `v1:${salt}:${buf.toString('hex')}`;
  }

  static async verifyPassword(password: string, hashString: string): Promise<boolean> {
    const [version, salt, key] = hashString.split(':');
    if (version !== 'v1' || !salt || !key) return false;
    const keyBuf = Buffer.from(key, 'hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    return crypto.timingSafeEqual(keyBuf, derivedKey);
  }

  static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static hashSessionToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
