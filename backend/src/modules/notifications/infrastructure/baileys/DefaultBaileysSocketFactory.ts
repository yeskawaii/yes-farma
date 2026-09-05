import pino from 'pino';
import {
  BaileysSocketFactoryOptions,
  IBaileysSocketFactory,
  IBaileysSocketInstance
} from './BaileysTypes';
import { IWhatsAppWebVersionProvider } from './IWhatsAppWebVersionProvider';
import { BaileysWebVersionProvider } from './BaileysWebVersionProvider';

export class DefaultBaileysSocketFactory implements IBaileysSocketFactory {
  private readonly webVersionProvider: IWhatsAppWebVersionProvider;

  constructor(webVersionProvider?: IWhatsAppWebVersionProvider | undefined) {
    this.webVersionProvider = webVersionProvider ?? new BaileysWebVersionProvider();
  }

  createLogger(): ReturnType<typeof pino> {
    return pino({ level: 'silent' });
  }

  async createSocket(options: BaileysSocketFactoryOptions): Promise<IBaileysSocketInstance> {
    const version = await this.webVersionProvider.getCurrentVersion();
    const logger = options.logger ?? this.createLogger();
    const baileysModule = await import('@whiskeysockets/baileys');
    const socketOptions: Record<string, any> = {
      auth: options.auth,
      version,
      printQRInTerminal: false,
      logger
    };
    if (options.syncFullHistory !== undefined) {
      socketOptions.syncFullHistory = options.syncFullHistory;
    }
    const makeWASocket = baileysModule.default ?? baileysModule.makeWASocket;
    const sock = makeWASocket(socketOptions as any);
    return sock as unknown as IBaileysSocketInstance;
  }
}
