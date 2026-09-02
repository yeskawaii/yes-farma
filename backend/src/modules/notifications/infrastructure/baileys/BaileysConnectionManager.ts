import { DisconnectReason, ConnectionState, AuthenticationCreds } from '@whiskeysockets/baileys';
import { isBoom } from '@hapi/boom';
import { IWhatsAppConnection } from './IWhatsAppConnection';
import { IWhatsAppAuthStateStore } from './IWhatsAppAuthStateStore';
import {
  BaileysSendResult,
  IBaileysMessageSender,
  IBaileysSocketFactory,
  IBaileysSocketInstance,
  WhatsAppConnectionState
} from './BaileysTypes';
import { DefaultBaileysSocketFactory } from './DefaultBaileysSocketFactory';

export class BaileysConnectionManager implements IWhatsAppConnection, IBaileysMessageSender {
  private state: WhatsAppConnectionState = 'DISCONNECTED';
  private latestQr: string | null = null;
  private socket: IBaileysSocketInstance | null = null;
  private readonly socketFactory: IBaileysSocketFactory;

  constructor(
    private readonly authStateStore: IWhatsAppAuthStateStore,
    socketFactory?: IBaileysSocketFactory
  ) {
    this.socketFactory = socketFactory ?? new DefaultBaileysSocketFactory();
  }

  getState(): WhatsAppConnectionState {
    return this.state;
  }

  getLatestQr(): string | null {
    return this.latestQr;
  }

  getMessageSender(): IBaileysMessageSender | null {
    if (this.state === 'CONNECTED' && this.socket) {
      return this;
    }
    return null;
  }

  async start(): Promise<void> {
    if (this.state === 'CONNECTED' || this.state === 'CONNECTING' || this.state === 'LOGGED_OUT') {
      return;
    }

    // Safely dispose any previous socket before replacement
    if (this.socket) {
      try {
        this.socket.end();
      } catch {
        // Safe disposal
      }
      this.socket = null;
    }

    this.state = 'CONNECTING';

    try {
      const { state: authState, saveCreds } = await this.authStateStore.getAuthState();

      this.socket = await this.socketFactory.createSocket({
        auth: authState
      });

      this.socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && typeof qr === 'string') {
          this.latestQr = qr;
          this.state = 'QR_REQUIRED';
        }

        if (connection === 'open') {
          this.latestQr = null;
          this.state = 'CONNECTED';
        }

        if (connection === 'close') {
          this.latestQr = null;

          if (this.socket) {
            try {
              this.socket.end();
            } catch {
              // Safe disposal
            }
            this.socket = null;
          }

          const error = lastDisconnect?.error;
          let statusCode: number | undefined;

          if (isBoom(error)) {
            statusCode = error.output.statusCode;
          } else if (error && typeof error === 'object' && 'output' in error && typeof (error as any).output?.statusCode === 'number') {
            statusCode = (error as any).output.statusCode;
          } else if (error && typeof error === 'object' && 'statusCode' in error && typeof (error as any).statusCode === 'number') {
            statusCode = (error as any).statusCode;
          }

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            this.state = 'LOGGED_OUT';
          } else {
            this.state = 'RECONNECTING';
          }
        }
      });

      this.socket.ev.on('creds.update', async (_creds: Partial<AuthenticationCreds>) => {
        try {
          await saveCreds();
        } catch {
          // Failure handling without logging credentials
        }
      });
    } catch {
      this.state = 'ERROR';
      if (this.socket) {
        try {
          this.socket.end();
        } catch {
          // Safe disposal
        }
        this.socket = null;
      }
      this.latestQr = null;
    }
  }

  async close(): Promise<void> {
    if (this.socket) {
      try {
        this.socket.end();
      } catch {
        // Safe disposal
      }
      this.socket = null;
    }
    this.latestQr = null;
    this.state = 'DISCONNECTED';
  }

  async sendMessage(jid: string, content: { text: string }): Promise<BaileysSendResult | null | undefined> {
    if (this.state !== 'CONNECTED' || !this.socket) {
      throw new Error('WHATSAPP_NOT_CONNECTED');
    }
    return this.socket.sendMessage(jid, content);
  }
}
