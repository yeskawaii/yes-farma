import makeWASocket from '@whiskeysockets/baileys';
import {
  BaileysSocketFactoryOptions,
  IBaileysSocketFactory,
  IBaileysSocketInstance
} from './BaileysTypes';

export class DefaultBaileysSocketFactory implements IBaileysSocketFactory {
  async createSocket(options: BaileysSocketFactoryOptions): Promise<IBaileysSocketInstance> {
    const sock = makeWASocket({
      auth: options.auth,
      printQRInTerminal: false
    });
    return sock as unknown as IBaileysSocketInstance;
  }
}
