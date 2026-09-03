import type { ConnectionState, AuthenticationCreds } from '@whiskeysockets/baileys';
import { isBoom } from '@hapi/boom';
import {
  IWhatsAppConnection,
  WaitForAuthPersistenceOptions,
  CloseWhatsAppConnectionOptions
} from './IWhatsAppConnection';
import { IWhatsAppAuthStateStore } from './IWhatsAppAuthStateStore';
import { IWhatsAppRecipientQuery } from './IWhatsAppRecipientQuery';
import {
  BaileysSendResult,
  BaileysDisconnectReason,
  IBaileysMessageSender,
  IBaileysSocketFactory,
  IBaileysSocketInstance,
  WhatsAppConnectionState,
  WhatsAppDisconnectReason
} from './BaileysTypes';
import { DefaultBaileysSocketFactory } from './DefaultBaileysSocketFactory';

export class BaileysConnectionManager
  implements IWhatsAppConnection, IBaileysMessageSender, IWhatsAppRecipientQuery {
  private state: WhatsAppConnectionState = 'DISCONNECTED';
  private latestQr: string | null = null;
  private disconnectReason: WhatsAppDisconnectReason | null = null;
  private socket: IBaileysSocketInstance | null = null;
  private readonly socketFactory: IBaileysSocketFactory;

  private qrObservedSinceStart = false;
  private successfulCredentialPersistenceSinceStart = false;
  private persistenceFailureSinceStart = false;
  private hasReportedCloseError = false;
  private persistenceChain: Promise<void> = Promise.resolve();
  private persistenceListeners: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  private isClosing = false;
  private closingPromise: Promise<void> | null = null;

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

  getDisconnectReason(): WhatsAppDisconnectReason | null {
    return this.disconnectReason;
  }

  getMessageSender(): IBaileysMessageSender | null {
    if (this.isClosing || this.state !== 'CONNECTED' || !this.socket) {
      return null;
    }
    return this;
  }

  async queryRegisteredRecipient(phone: string): Promise<Array<{ jid: string; exists: boolean }>> {
    if (this.isClosing || this.state !== 'CONNECTED' || !this.socket) {
      throw new Error('WHATSAPP_NOT_CONNECTED');
    }

    if (!this.socket.onWhatsApp) {
      throw new Error('WHATSAPP_QUERY_NOT_SUPPORTED');
    }

    const results = await this.socket.onWhatsApp(phone);
    return results ?? [];
  }

  private extractDisconnectInfo(error: unknown): {
    statusCode: number | undefined;
    isDeviceRemoved: boolean;
  } {
    let statusCode: number | undefined;

    if (isBoom(error)) {
      statusCode = error.output.statusCode;
    } else if (
      error &&
      typeof error === 'object' &&
      'output' in error &&
      typeof (error as any).output?.statusCode === 'number'
    ) {
      statusCode = (error as any).output.statusCode;
    } else if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof (error as any).statusCode === 'number'
    ) {
      statusCode = (error as any).statusCode;
    }

    const errorMessage =
      (error instanceof Error
        ? error.message
        : typeof (error as any)?.message === 'string'
        ? (error as any).message
        : ''
      ).toLowerCase();

    const isDeviceRemoved =
      errorMessage.includes('device_removed') ||
      (error as any)?.data?.reason === 'device_removed';

    return { statusCode, isDeviceRemoved };
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
    if (
      this.isClosing ||
      this.state === 'CONNECTED' ||
      this.state === 'CONNECTING' ||
      this.state === 'LOGGED_OUT' ||
      this.state === 'DEVICE_REMOVED'
    ) {
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
    this.disconnectReason = null;
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

        if (this.isClosing) {
          if (connection === 'close') {
            const { statusCode, isDeviceRemoved } = this.extractDisconnectInfo(lastDisconnect?.error);
            if (isDeviceRemoved) {
              this.state = 'DEVICE_REMOVED';
              this.disconnectReason = 'DEVICE_REMOVED';
            } else if (statusCode === BaileysDisconnectReason.loggedOut || statusCode === 401) {
              this.state = 'LOGGED_OUT';
              this.disconnectReason = 'LOGGED_OUT';
            }
          }
          return;
        }

        if (qr && typeof qr === 'string') {
          this.latestQr = qr;
          this.qrObservedSinceStart = true;
          this.state = 'QR_REQUIRED';
        }

        if (connection === 'open') {
          this.latestQr = null;
          this.state = 'CONNECTED';
          this.disconnectReason = null;
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

          const { statusCode, isDeviceRemoved } = this.extractDisconnectInfo(lastDisconnect?.error);

          if (isDeviceRemoved) {
            this.state = 'DEVICE_REMOVED';
            this.disconnectReason = 'DEVICE_REMOVED';
          } else if (statusCode === BaileysDisconnectReason.loggedOut || statusCode === 401) {
            this.state = 'LOGGED_OUT';
            this.disconnectReason = 'LOGGED_OUT';
          } else if (statusCode === BaileysDisconnectReason.restartRequired || statusCode === 515) {
            this.state = 'RECONNECTING';
            this.disconnectReason = 'RESTART_REQUIRED';
          } else if (statusCode !== undefined) {
            this.state = 'RECONNECTING';
            this.disconnectReason = 'TEMPORARY_DISCONNECT';
          } else {
            this.state = 'RECONNECTING';
            this.disconnectReason = 'UNKNOWN';
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

  async close(options?: CloseWhatsAppConnectionOptions): Promise<void> {
    if (this.closingPromise) {
      return this.closingPromise;
    }

    this.closingPromise = this.performClose(options);
    try {
      await this.closingPromise;
    } finally {
      this.closingPromise = null;
    }
  }

  private async performClose(options?: CloseWhatsAppConnectionOptions): Promise<void> {
    this.isClosing = true;
    this.latestQr = null;

    const timeoutMs = options?.persistenceTimeoutMs ?? 10_000;
    const startTime = Date.now();
    const deadline = startTime + timeoutMs;

    // 1. Dispose socket cleanly without logout
    if (this.socket) {
      const sockToDispose = this.socket;
      this.socket = null;
      try {
        const maybePromise: any = sockToDispose.end();
        if (maybePromise && typeof maybePromise.then === 'function') {
          await Promise.race([
            maybePromise.catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 1000))
          ]);
        }
      } catch {
        // Safe disposal
      }
    }

    // 2. Drain persistence chain with global deadline
    let persistenceTimedOut = false;
    while (true) {
      const currentChain = this.persistenceChain;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        persistenceTimedOut = true;
        break;
      }

      let timer: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<'TIMEOUT'>((resolve) => {
        timer = setTimeout(() => resolve('TIMEOUT'), remainingMs);
      });

      const raceResult = await Promise.race([
        currentChain.then(() => 'DRAINED').catch(() => 'DRAINED'),
        timeoutPromise
      ]);

      if (timer) {
        clearTimeout(timer);
      }

      if (raceResult === 'TIMEOUT') {
        persistenceTimedOut = true;
        break;
      }

      if (this.persistenceChain === currentChain) {
        break;
      }
    }

    // 3. Finalize state
    if (this.state !== 'DEVICE_REMOVED' && this.state !== 'LOGGED_OUT') {
      this.state = 'DISCONNECTED';
      this.disconnectReason = null;
    }
    this.isClosing = false;

    // 4. Evaluate persistence status:
    // Sticky persistence failure takes precedence over timeout
    if (this.persistenceFailureSinceStart) {
      if (!this.hasReportedCloseError) {
        this.hasReportedCloseError = true;
        throw new Error('WHATSAPP_AUTH_PERSISTENCE_FAILED');
      }
      return;
    }

    if (persistenceTimedOut) {
      throw new Error('WHATSAPP_AUTH_PERSISTENCE_TIMEOUT');
    }
  }

  async sendMessage(jid: string, content: { text: string }): Promise<BaileysSendResult | null | undefined> {
    if (this.isClosing || this.state !== 'CONNECTED' || !this.socket) {
      throw new Error('WHATSAPP_NOT_CONNECTED');
    }
    return this.socket.sendMessage(jid, content);
  }
}
