import { DisconnectReason, ConnectionState, AuthenticationCreds } from '@whiskeysockets/baileys';
import { isBoom } from '@hapi/boom';
import { IWhatsAppConnection, WaitForAuthPersistenceOptions } from './IWhatsAppConnection';
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

  private qrObservedSinceStart = false;
  private successfulCredentialPersistenceSinceStart = false;
  private persistenceFailureSinceStart = false;
  private hasReportedCloseError = false;
  private persistenceChain: Promise<void> = Promise.resolve();
  private persistenceListeners: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

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

  private notifyPersistenceSuccess(): void {
    const listeners = [...this.persistenceListeners];
    this.persistenceListeners = [];
    for (const l of listeners) {
      l.resolve();
    }
  }

  private notifyPersistenceFailure(err: Error): void {
    const listeners = [...this.persistenceListeners];
    this.persistenceListeners = [];
    for (const l of listeners) {
      l.reject(err);
    }
  }

  async waitForAuthPersistence(options?: WaitForAuthPersistenceOptions): Promise<void> {
    // If this connection did not pass through QR_REQUIRED (e.g. existing session probe),
    // no new credential persistence is required.
    if (!this.qrObservedSinceStart) {
      return;
    }

    if (this.persistenceFailureSinceStart) {
      throw new Error('WHATSAPP_AUTH_PERSISTENCE_FAILED');
    }

    if (this.successfulCredentialPersistenceSinceStart) {
      return;
    }

    const timeoutMs = options?.timeoutMs ?? 10_000;

    return new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;

      const onResolve = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resolve();
      };

      const onReject = (err: Error) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        reject(err);
      };

      timer = setTimeout(() => {
        timer = null;
        const idx = this.persistenceListeners.findIndex((l) => l.resolve === onResolve);
        if (idx !== -1) {
          this.persistenceListeners.splice(idx, 1);
        }
        reject(new Error('WHATSAPP_AUTH_PERSISTENCE_TIMEOUT'));
      }, timeoutMs);

      this.persistenceListeners.push({ resolve: onResolve, reject: onReject });
    });
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

    this.qrObservedSinceStart = false;
    this.successfulCredentialPersistenceSinceStart = false;
    this.persistenceFailureSinceStart = false;
    this.hasReportedCloseError = false;
    this.persistenceChain = Promise.resolve();
    this.notifyPersistenceFailure(new Error('WHATSAPP_CONNECTION_RESET'));

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
          this.qrObservedSinceStart = true;
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

      this.socket.ev.on('creds.update', (_creds: Partial<AuthenticationCreds>) => {
        this.persistenceChain = this.persistenceChain
          .then(async () => {
            await saveCreds();
            this.successfulCredentialPersistenceSinceStart = true;
            if (!this.persistenceFailureSinceStart) {
              this.notifyPersistenceSuccess();
            } else {
              this.notifyPersistenceFailure(new Error('WHATSAPP_AUTH_PERSISTENCE_FAILED'));
            }
          })
          .catch((_err: unknown) => {
            this.persistenceFailureSinceStart = true;
            const failureError = new Error('WHATSAPP_AUTH_PERSISTENCE_FAILED');
            this.notifyPersistenceFailure(failureError);
          });
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
    try {
      await this.persistenceChain;
    } catch {
      // Handled below
    }

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

    if (this.persistenceFailureSinceStart && !this.hasReportedCloseError) {
      this.hasReportedCloseError = true;
      throw new Error('WHATSAPP_AUTH_PERSISTENCE_FAILED');
    }
  }

  async sendMessage(jid: string, content: { text: string }): Promise<BaileysSendResult | null | undefined> {
    if (this.state !== 'CONNECTED' || !this.socket) {
      throw new Error('WHATSAPP_NOT_CONNECTED');
    }
    return this.socket.sendMessage(jid, content);
  }
}
