import { IWhatsAppConnection } from './IWhatsAppConnection';
import { INotificationDeliveryPort } from '../../domain/NotificationDeliveryPort';
import { IWhatsAppAuthStateStore } from './IWhatsAppAuthStateStore';
import { MultiFileAuthStateStore } from './MultiFileAuthStateStore';
import { BaileysConnectionManager } from './BaileysConnectionManager';
import { BaileysNotificationDeliveryAdapter } from './BaileysNotificationDeliveryAdapter';
import { IBaileysSocketFactory } from './BaileysTypes';
import { prepareWhatsAppAuthDir } from './prepareWhatsAppAuthDir';

export interface WhatsAppRuntimeOptions {
  authDir: string;
  socketFactory?: IBaileysSocketFactory | undefined;
  requireAbsoluteAuthDir?: boolean | undefined;
}

export interface WhatsAppRuntime {
  connection: IWhatsAppConnection;
  delivery: INotificationDeliveryPort;
  authStateStore: IWhatsAppAuthStateStore;
  authDir: string;
}

export const createWhatsAppRuntime = (options: WhatsAppRuntimeOptions): WhatsAppRuntime => {
  const resolvedAuthDir = prepareWhatsAppAuthDir(options.authDir, {
    requireAbsolute: options.requireAbsoluteAuthDir
  });

  const authStateStore = new MultiFileAuthStateStore(resolvedAuthDir);
  const connection = new BaileysConnectionManager(authStateStore, options.socketFactory);
  const delivery = new BaileysNotificationDeliveryAdapter(connection);

  return {
    connection,
    delivery,
    authStateStore,
    authDir: resolvedAuthDir
  };
};
