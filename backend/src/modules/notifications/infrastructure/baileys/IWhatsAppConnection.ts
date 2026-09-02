import { IBaileysMessageSender, WhatsAppConnectionState } from './BaileysTypes';

export interface IWhatsAppConnection {
  getState(): WhatsAppConnectionState;
  getLatestQr(): string | null;
  start(): Promise<void>;
  close(): Promise<void>;
  getMessageSender(): IBaileysMessageSender | null;
}
