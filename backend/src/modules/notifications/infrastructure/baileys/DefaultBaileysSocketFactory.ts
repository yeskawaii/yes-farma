import makeWASocket from '@whiskeysockets/baileys';
import pino from 'pino';
import {
  BaileysSocketFactoryOptions,
  IBaileysSocketFactory,
  IBaileysSocketInstance
} from './BaileysTypes';

export class DefaultBaileysSocketFactory implements IBaileysSocketFactory {
  createLogger(): ReturnType<typeof pino> {
    return pino({ level: 'silent' });
  }

  async createSocket(options: BaileysSocketFactoryOptions): Promise<IBaileysSocketInstance> {
    const logger = options.logger ?? this.createLogger();
    const sock = makeWASocket({
      auth: options.auth,
      printQRInTerminal: false,
      logger
    });
    return sock as unknown as IBaileysSocketInstance;
  }
}
