import { IWhatsAppConnection } from './IWhatsAppConnection';
import { INotificationDeliveryPort } from '../../domain/NotificationDeliveryPort';
import { IWhatsAppAuthStateStore } from './IWhatsAppAuthStateStore';
import { MultiFileAuthStateStore } from './MultiFileAuthStateStore';
import { BaileysConnectionManager } from './BaileysConnectionManager';
import { BaileysNotificationDeliveryAdapter } from './BaileysNotificationDeliveryAdapter';
import { IBaileysSocketFactory } from './BaileysTypes';
import { prepareWhatsAppAuthDir } from './prepareWhatsAppAuthDir';
import { IWhatsAppRecipientResolver } from './IWhatsAppRecipientResolver';
import { BaileysRecipientResolver } from './BaileysRecipientResolver';
import { IWhatsAppWebVersionProvider } from './IWhatsAppWebVersionProvider';
import { DefaultBaileysSocketFactory } from './DefaultBaileysSocketFactory';

export interface WhatsAppRuntimeOptions {
  authDir: string;
  socketFactory?: IBaileysSocketFactory | undefined;
  requireAbsoluteAuthDir?: boolean | undefined;
  onSendAttempt?: (() => void) | undefined;
  recipientResolver?: IWhatsAppRecipientResolver | undefined;
  webVersionProvider?: IWhatsAppWebVersionProvider | undefined;
  syncFullHistory?: boolean | undefined;
}

export interface WhatsAppRuntime {
  connection: IWhatsAppConnection;
  delivery: INotificationDeliveryPort;
  authStateStore: IWhatsAppAuthStateStore;
  recipientResolver: IWhatsAppRecipientResolver;
  webVersionProvider?: IWhatsAppWebVersionProvider | undefined;
  authDir: string;
}

export const createWhatsAppRuntime = (options: WhatsAppRuntimeOptions): WhatsAppRuntime => {
  const resolvedAuthDir = prepareWhatsAppAuthDir(options.authDir, {
    requireAbsolute: options.requireAbsoluteAuthDir
  });

  const authStateStore = new MultiFileAuthStateStore(resolvedAuthDir);
  const socketFactory =
    options.socketFactory ??
    new DefaultBaileysSocketFactory(options.webVersionProvider);
  const connection = new BaileysConnectionManager(authStateStore, socketFactory, {
    syncFullHistory: options.syncFullHistory
  });
  const recipientResolver = options.recipientResolver ?? new BaileysRecipientResolver(connection);
  const delivery = new BaileysNotificationDeliveryAdapter(connection, {
    recipientResolver,
    onSendAttempt: options.onSendAttempt
  });

  return {
    connection,
    delivery,
    authStateStore,
    recipientResolver,
    webVersionProvider: options.webVersionProvider,
    authDir: resolvedAuthDir
  };
};
