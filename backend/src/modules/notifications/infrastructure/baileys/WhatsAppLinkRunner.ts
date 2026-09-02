import { IWhatsAppConnection } from './IWhatsAppConnection';
import { IQrRenderer } from './IQrRenderer';

export type WhatsAppLinkStatus = 'LINKED' | 'LOGGED_OUT' | 'ERROR' | 'TIMEOUT' | 'ABORTED';

export interface WhatsAppLinkResult {
  status: WhatsAppLinkStatus;
}

export interface WhatsAppLinkRunnerOptions {
  connection: IWhatsAppConnection;
  qrRenderer: IQrRenderer;
  timeoutMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  } | undefined;
  registerSignalHandlers?: boolean | undefined;
}

export class WhatsAppLinkRunner {
  private readonly connection: IWhatsAppConnection;
  private readonly qrRenderer: IQrRenderer;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
  private readonly registerSignalHandlers: boolean;

  constructor(options: WhatsAppLinkRunnerOptions) {
    this.connection = options.connection;
    this.qrRenderer = options.qrRenderer;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.logger = options.logger ?? {
      info: (msg: string) => console.log(msg),
      error: (msg: string) => console.error(msg)
    };
    this.registerSignalHandlers = options.registerSignalHandlers ?? false;
  }

  async run(): Promise<WhatsAppLinkResult> {
    let lastRenderedQr: string | null = null;
    let qrObserved = false;
    let restartsCount = 0;
    let aborted = false;

    const onSignal = async () => {
      aborted = true;
      try {
        await this.connection.close();
      } catch {
        // Safe disposal
      }
    };

    if (this.registerSignalHandlers && typeof process !== 'undefined') {
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
    }

    try {
      await this.connection.start();

      const startTime = Date.now();

      while (true) {
        if (aborted) {
          return { status: 'ABORTED' };
        }

        const state = this.connection.getState();

        if (state === 'QR_REQUIRED') {
          qrObserved = true;
          const qr = this.connection.getLatestQr();
          if (qr && qr !== lastRenderedQr) {
            this.qrRenderer.render(qr);
            lastRenderedQr = qr;
          }
        } else if (state === 'CONNECTED') {
          const remainingMs = Math.max(1000, this.timeoutMs - (Date.now() - startTime));

          if (this.connection.waitForAuthPersistence) {
            try {
              await this.connection.waitForAuthPersistence({ timeoutMs: remainingMs });
            } catch (err: unknown) {
              const isTimeout = err instanceof Error && err.message === 'WHATSAPP_AUTH_PERSISTENCE_TIMEOUT';
              if (isTimeout) {
                this.logger.error('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE_TIMEOUT');
              } else {
                this.logger.error('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE');
              }
              try {
                await this.connection.close();
              } catch {
                // Safe disposal
              }
              return { status: 'ERROR' };
            }
          }

          try {
            await this.connection.close();
            this.logger.info('WHATSAPP_LINKED=YES');
            return { status: 'LINKED' };
          } catch {
            this.logger.error('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE');
            return { status: 'ERROR' };
          }
        } else if (state === 'LOGGED_OUT') {
          this.logger.error('WHATSAPP_LINK_FAILED=LOGGED_OUT');
          try {
            await this.connection.close();
          } catch {
            // Safe disposal
          }
          return { status: 'LOGGED_OUT' };
        } else if (state === 'ERROR') {
          this.logger.error('WHATSAPP_LINK_FAILED=ERROR');
          try {
            await this.connection.close();
          } catch {
            // Safe disposal
          }
          return { status: 'ERROR' };
        } else if (state === 'RECONNECTING') {
          const disconnectReason = this.connection.getDisconnectReason
            ? this.connection.getDisconnectReason()
            : null;

          if (disconnectReason === 'RESTART_REQUIRED') {
            if (qrObserved && restartsCount < 1) {
              const remainingMs = Math.max(1000, this.timeoutMs - (Date.now() - startTime));

              // 1. Esperar barrera de persistence
              if (this.connection.waitForAuthPersistence) {
                try {
                  await this.connection.waitForAuthPersistence({ timeoutMs: remainingMs });
                } catch (err: unknown) {
                  const isTimeout = err instanceof Error && err.message === 'WHATSAPP_AUTH_PERSISTENCE_TIMEOUT';
                  if (isTimeout) {
                    this.logger.error('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE_TIMEOUT');
                  } else {
                    this.logger.error('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE');
                  }
                  try {
                    await this.connection.close();
                  } catch {
                    // Safe disposal
                  }
                  return { status: 'ERROR' };
                }
              }

              // 2. Disponer socket viejo (DEBE completar sin error)
              try {
                await this.connection.close();
              } catch (err: unknown) {
                const isPersistence = err instanceof Error && err.message === 'WHATSAPP_AUTH_PERSISTENCE_FAILED';
                if (isPersistence) {
                  this.logger.error('WHATSAPP_LINK_FAILED=AUTH_PERSISTENCE');
                } else {
                  this.logger.error('WHATSAPP_LINK_FAILED=ERROR');
                }
                return { status: 'ERROR' };
              }

              restartsCount++;

              // 3. Start nuevo (solamente tras close exitoso)
              try {
                await this.connection.start();
              } catch {
                this.logger.error('WHATSAPP_LINK_FAILED=ERROR');
                return { status: 'ERROR' };
              }

              continue;
            } else if (restartsCount >= 1) {
              this.logger.error('WHATSAPP_LINK_FAILED=RESTART_LIMIT_EXCEEDED');
              try {
                await this.connection.close();
              } catch {
                // Safe disposal
              }
              return { status: 'ERROR' };
            }
          }
        }

        if (Date.now() - startTime >= this.timeoutMs) {
          this.logger.error('WHATSAPP_LINK_TIMEOUT');
          try {
            await this.connection.close();
          } catch {
            // Safe disposal
          }
          return { status: 'TIMEOUT' };
        }

        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }
    } finally {
      if (this.registerSignalHandlers && typeof process !== 'undefined') {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
      }
    }
  }
}
