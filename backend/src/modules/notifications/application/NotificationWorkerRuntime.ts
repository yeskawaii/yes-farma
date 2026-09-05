import { IWhatsAppConnection } from '../infrastructure/baileys/IWhatsAppConnection';
import { WhatsAppConnectionState } from '../infrastructure/baileys/BaileysTypes';
import {
  NotificationWorkerService,
  WorkerRunSummary
} from './NotificationWorkerService';

export interface NotificationWorkerRuntimeOptions {
  enabled: boolean;
  pollIntervalMs: number;
  connectionShutdownTimeoutMs?: number | undefined;
  onCycleComplete?: ((summary: WorkerRunSummary) => void) | undefined;
  onCycleError?: ((error: unknown) => void) | undefined;
}

export interface WorkerRuntimeStatus {
  workerEnabled: boolean;
  workerRunning: boolean;
  isProcessing: boolean;
  whatsappState: WhatsAppConnectionState | 'DISABLED' | 'NONE';
  consecutiveFailures: number;
  lastRunAt: Date | null;
  lastRunSummary: WorkerRunSummary | null;
}

export function sanitizeWorkerLogMessage(message: string): string {
  return message
    .replace(/\+?\b\d{10,15}(?:@(?:s\.whatsapp\.net|c\.us|lid))?\b/g, '[REDACTED_PHONE_OR_JID]')
    .replace(/\b\d+@lid\b/g, '[REDACTED_LID]')
    .replace(/2@[A-Za-z0-9+/=,]+/g, '[REDACTED_QR]')
    .replace(
      /(?:noiseKey|pairingCode|signedIdentityKey|signedPreKey|registrationId|advSecretKey|me|account|creds|sessionEntry)["']?\s*[:=]\s*["']?[^"',\s}]+/gi,
      '$1:[REDACTED_AUTH_KEY]'
    )
    .replace(/(?:text|body|messageContent)["']?\s*[:=]\s*["'][^"']+["']/gi, '$1:"[REDACTED_MESSAGE]"');
}

export class NotificationWorkerRuntime {
  private isRunning = false;
  private isProcessing = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeCyclePromise: Promise<void> | null = null;
  private consecutiveFailures = 0;
  private lastRunAt: Date | null = null;
  private lastRunSummary: WorkerRunSummary | null = null;

  constructor(
    private readonly workerService: NotificationWorkerService,
    private readonly connection?: IWhatsAppConnection | null,
    private readonly options: NotificationWorkerRuntimeOptions = {
      enabled: false,
      pollIntervalMs: 5000
    }
  ) {}

  get isEnabled(): boolean {
    return this.options.enabled;
  }

  get running(): boolean {
    return this.isRunning;
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  getStatus(): WorkerRuntimeStatus {
    let whatsappState: WhatsAppConnectionState | 'DISABLED' | 'NONE' = 'DISABLED';
    if (this.options.enabled) {
      whatsappState = this.connection ? this.connection.getState() : 'NONE';
    }

    return {
      workerEnabled: this.options.enabled,
      workerRunning: this.isRunning,
      isProcessing: this.isProcessing,
      whatsappState,
      consecutiveFailures: this.consecutiveFailures,
      lastRunAt: this.lastRunAt,
      lastRunSummary: this.lastRunSummary
    };
  }

  async start(): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    if (this.connection) {
      try {
        await this.connection.start();
      } catch (err: unknown) {
        this.logSanitized('Failed to start WhatsApp connection:', err);
      }
    }

    this.scheduleNextTick(0);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.activeCyclePromise) {
      try {
        await this.activeCyclePromise;
      } catch {
        // Safe isolation
      }
    }

    if (this.connection) {
      try {
        await this.connection.close({
          persistenceTimeoutMs: this.options.connectionShutdownTimeoutMs ?? 5000
        });
      } catch (err: unknown) {
        this.logSanitized('Failed to close WhatsApp connection gracefully:', err);
      }
    }
  }

  async triggerTick(): Promise<void> {
    await this.tick();
  }

  private scheduleNextTick(delayMs?: number): void {
    if (!this.isRunning) {
      return;
    }

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const delay = delayMs !== undefined ? delayMs : this.options.pollIntervalMs;
    this.pollTimer = setTimeout(() => {
      void this.tick();
    }, delay);

    if (this.pollTimer && typeof (this.pollTimer as any).unref === 'function') {
      (this.pollTimer as any).unref();
    }
  }

  private async tick(): Promise<void> {
    if (!this.isRunning || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.activeCyclePromise = (async () => {
      try {
        const summary = await this.workerService.runOnce();
        this.lastRunAt = new Date();
        this.lastRunSummary = summary;
        this.consecutiveFailures = 0;
        this.options.onCycleComplete?.(summary);
      } catch (err: unknown) {
        this.consecutiveFailures++;
        this.logSanitized('Notification worker cycle error:', err);
        this.options.onCycleError?.(err);
      } finally {
        this.isProcessing = false;
        this.activeCyclePromise = null;
        if (this.isRunning) {
          this.scheduleNextTick();
        }
      }
    })();

    await this.activeCyclePromise;
  }

  private logSanitized(context: string, err: unknown): void {
    const rawMsg = err instanceof Error ? err.message : String(err ?? 'UNKNOWN_ERROR');
    const safeMsg = sanitizeWorkerLogMessage(`${context} ${rawMsg}`);
    console.error(safeMsg);
  }
}
