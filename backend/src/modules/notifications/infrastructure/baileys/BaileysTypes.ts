import type {
  AuthenticationState,
  AuthenticationCreds,
  ConnectionState
} from '@whiskeysockets/baileys';
import { IWhatsAppAuthStateStore } from './IWhatsAppAuthStateStore';

export type { IWhatsAppAuthStateStore };

export type WhatsAppConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'QR_REQUIRED'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'LOGGED_OUT'
  | 'DEVICE_REMOVED'
  | 'ERROR';

export type WhatsAppDisconnectReason =
  | 'RESTART_REQUIRED'
  | 'TEMPORARY_DISCONNECT'
  | 'LOGGED_OUT'
  | 'DEVICE_REMOVED'
  | 'UNKNOWN';

export const BaileysDisconnectReason = {
  connectionClosed: 428,
  connectionLost: 408,
  connectionReplaced: 440,
  timedOut: 408,
  loggedOut: 401,
  badSession: 500,
  restartRequired: 515,
  multideviceMismatch: 411,
  forbidden: 403,
  unavailableService: 503
} as const;

export interface BaileysSendResult {
  key?: {
    id?: string | null;
    remoteJid?: string | null;
  } | null;
}

export interface IBaileysMessageSender {
  sendMessage(jid: string, content: { text: string }): Promise<BaileysSendResult | null | undefined>;
}

export interface BaileysMessagingHistorySetEvent {
  chats?: unknown[];
  contacts?: unknown[];
  messages?: unknown[];
  lidPnMappings?: unknown[];
  isLatest?: boolean;
  progress?: number | null;
  syncType?: number | string | null;
}

export interface WhatsAppHistorySyncStats {
  eventReceived: boolean;
  eventsCount: number;
  syncType: number | string | null;
  progress: number | null;
  isLatest: boolean;
  lidPnMappingsCount: number;
  chatsCount: number;
  contactsCount: number;
  messagesCount: number;
}

export interface IBaileysSocketEvents {
  on(event: 'connection.update', listener: (update: Partial<ConnectionState>) => void): void;
  on(event: 'creds.update', listener: (creds: Partial<AuthenticationCreds>) => void): void;
}

export interface IBaileysSocketInstance {
  ev: IBaileysSocketEvents;
  sendMessage(jid: string, content: { text: string }): Promise<BaileysSendResult | null | undefined>;
  onWhatsApp?(...phoneNumber: string[]): Promise<Array<{ jid: string; exists: boolean }>>;
  end(error?: Error): void;
}

export interface BaileysSocketFactoryOptions {
  auth: AuthenticationState;
  logger?: any | undefined;
  syncFullHistory?: boolean | undefined;
}

export interface IBaileysSocketFactory {
  createSocket(options: BaileysSocketFactoryOptions): Promise<IBaileysSocketInstance>;
}

export const BaileysFailureCodes = {
  WHATSAPP_NOT_CONNECTED: 'WHATSAPP_NOT_CONNECTED',
  WHATSAPP_CONNECTION_CLOSED: 'WHATSAPP_CONNECTION_CLOSED',
  WHATSAPP_TEMPORARY_FAILURE: 'WHATSAPP_TEMPORARY_FAILURE',
  WHATSAPP_LOGGED_OUT: 'WHATSAPP_LOGGED_OUT',
  WHATSAPP_DEVICE_REMOVED: 'WHATSAPP_DEVICE_REMOVED',
  WHATSAPP_RATE_LIMIT: 'WHATSAPP_RATE_LIMIT',
  WHATSAPP_RECIPIENT_INVALID: 'WHATSAPP_RECIPIENT_INVALID',
  WHATSAPP_NOT_REGISTERED: 'WHATSAPP_NOT_REGISTERED',
  WHATSAPP_SEND_TIMEOUT: 'WHATSAPP_SEND_TIMEOUT',
  WHATSAPP_SEND_OUTCOME_UNKNOWN: 'WHATSAPP_SEND_OUTCOME_UNKNOWN',
  WHATSAPP_INTERNAL_ERROR: 'WHATSAPP_INTERNAL_ERROR',
  UNSUPPORTED_NOTIFICATION_CHANNEL: 'UNSUPPORTED_NOTIFICATION_CHANNEL'
} as const;
