import { IWhatsAppWebVersionProvider } from './IWhatsAppWebVersionProvider';

export type FetchWaWebVersionFn = (
  options?: RequestInit
) => Promise<{ version: [number, number, number]; isLatest: boolean; error?: unknown }>;

export class BaileysWebVersionProvider implements IWhatsAppWebVersionProvider {
  constructor(private readonly fetchFn?: FetchWaWebVersionFn | undefined) {}

  async getCurrentVersion(): Promise<[number, number, number]> {
    try {
      let result;
      if (this.fetchFn) {
        result = await this.fetchFn();
      } else {
        const baileys = await import('@whiskeysockets/baileys');
        result = await baileys.fetchLatestWaWebVersion();
      }

      if (!result || result.isLatest !== true) {
        throw new Error('WHATSAPP_WEB_VERSION_UNAVAILABLE');
      }

      const version = result.version;
      if (
        !Array.isArray(version) ||
        version.length !== 3 ||
        !version.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)
      ) {
        throw new Error('WHATSAPP_WEB_VERSION_UNAVAILABLE');
      }

      return [version[0], version[1], version[2]];
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'WHATSAPP_WEB_VERSION_UNAVAILABLE') {
        throw err;
      }
      throw new Error('WHATSAPP_WEB_VERSION_UNAVAILABLE');
    }
  }
}
