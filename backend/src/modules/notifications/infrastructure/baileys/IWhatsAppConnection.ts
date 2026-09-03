import {
  IBaileysMessageSender,
  WhatsAppConnectionState,
  WhatsAppDisconnectReason
} from './BaileysTypes';

export interface WaitForAuthPersistenceOptions {
  timeoutMs?: number | undefined;
}

export interface CloseWhatsAppConnectionOptions {
  persistenceTimeoutMs?: number | undefined;
}

export interface IWhatsAppConnection {
  getState(): WhatsAppConnectionState;
  getLatestQr(): string | null;
  getDisconnectReason?(): WhatsAppDisconnectReason | null;
  start(): Promise<void>;
  close(options?: CloseWhatsAppConnectionOptions): Promise<void>;
  getMessageSender(): IBaileysMessageSender | null;
  waitForAuthPersistence?(options?: WaitForAuthPersistenceOptions): Promise<void>;
}
