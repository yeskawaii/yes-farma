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
          const qr = this.connection.getLatestQr();
          if (qr && qr !== lastRenderedQr) {
            this.qrRenderer.render(qr);
            lastRenderedQr = qr;
          }
        } else if (state === 'CONNECTED') {
          this.logger.info('WHATSAPP_LINKED=YES');
          await this.connection.close();
          return { status: 'LINKED' };
        } else if (state === 'LOGGED_OUT') {
          this.logger.error('WHATSAPP_LINK_FAILED=LOGGED_OUT');
          await this.connection.close();
          return { status: 'LOGGED_OUT' };
        } else if (state === 'ERROR') {
          this.logger.error('WHATSAPP_LINK_FAILED=ERROR');
          await this.connection.close();
          return { status: 'ERROR' };
        }

        if (Date.now() - startTime >= this.timeoutMs) {
          this.logger.error('WHATSAPP_LINK_TIMEOUT');
          await this.connection.close();
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
