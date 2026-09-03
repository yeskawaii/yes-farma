import { IWhatsAppConnection } from './IWhatsAppConnection';

export type WhatsAppProbeStatus = 'PASS' | 'LOGGED_OUT' | 'DEVICE_REMOVED' | 'FAIL' | 'TIMEOUT' | 'ABORTED';

export interface WhatsAppProbeResult {
  status: WhatsAppProbeStatus;
}

export interface WhatsAppProbeRunnerOptions {
  connection: IWhatsAppConnection;
  timeoutMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  } | undefined;
  registerSignalHandlers?: boolean | undefined;
}

export class WhatsAppProbeRunner {
  private readonly connection: IWhatsAppConnection;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
  private readonly registerSignalHandlers: boolean;

  constructor(options: WhatsAppProbeRunnerOptions) {
    this.connection = options.connection;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.logger = options.logger ?? {
      info: (msg: string) => console.log(msg),
      error: (msg: string) => console.error(msg)
    };
    this.registerSignalHandlers = options.registerSignalHandlers ?? false;
  }

  async run(): Promise<WhatsAppProbeResult> {
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

        if (state === 'CONNECTED') {
          this.logger.info('WHATSAPP_CONNECTION_PROBE=PASS');
          await this.connection.close();
          return { status: 'PASS' };
        }

        if (state === 'DEVICE_REMOVED') {
          this.logger.error('WHATSAPP_CONNECTION_PROBE=DEVICE_REMOVED');
          await this.connection.close();
          return { status: 'DEVICE_REMOVED' };
        }

        if (state === 'LOGGED_OUT') {
          this.logger.error('WHATSAPP_CONNECTION_PROBE=LOGGED_OUT');
          await this.connection.close();
          return { status: 'LOGGED_OUT' };
        }

        if (state === 'ERROR' || state === 'QR_REQUIRED') {
          this.logger.error('WHATSAPP_CONNECTION_PROBE=FAIL');
          await this.connection.close();
          return { status: 'FAIL' };
        }

        if (state === 'RECONNECTING') {
          const reason = this.connection.getDisconnectReason
            ? this.connection.getDisconnectReason()
            : null;
          if (reason === 'RESTART_REQUIRED') {
            this.logger.error('WHATSAPP_CONNECTION_PROBE=FAIL');
            await this.connection.close();
            return { status: 'FAIL' };
          }
        }

        if (Date.now() - startTime >= this.timeoutMs) {
          this.logger.error('WHATSAPP_CONNECTION_PROBE=TIMEOUT');
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
