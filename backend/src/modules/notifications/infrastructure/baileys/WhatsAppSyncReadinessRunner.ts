import { IWhatsAppConnection } from './IWhatsAppConnection';
import { WhatsAppHistorySyncStats } from './BaileysTypes';

export type WhatsAppSyncReadinessStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'NO_EVENT'
  | 'DEVICE_REMOVED'
  | 'LOGGED_OUT'
  | 'FAIL'
  | 'TIMEOUT'
  | 'ABORTED';

export interface WhatsAppSyncReadinessResult {
  status: WhatsAppSyncReadinessStatus;
  eventsCount: number;
  lastSyncType: number | string | null;
  lastProgress: number | null;
  isLatest: boolean;
  lidPnMappingsCount: number;
  chatsCount: number;
  contactsCount: number;
  messagesCount: number;
}

export interface WhatsAppSyncReadinessRunnerOptions {
  connection: IWhatsAppConnection;
  observationWindowMs?: number | undefined;
  connectTimeoutMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  } | undefined;
  registerSignalHandlers?: boolean | undefined;
}

export class WhatsAppSyncReadinessRunner {
  private readonly connection: IWhatsAppConnection;
  private readonly observationWindowMs: number;
  private readonly connectTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
  private readonly registerSignalHandlers: boolean;

  constructor(options: WhatsAppSyncReadinessRunnerOptions) {
    this.connection = options.connection;
    this.observationWindowMs = options.observationWindowMs ?? 120_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.logger = options.logger ?? {
      info: (msg: string) => console.log(msg),
      error: (msg: string) => console.error(msg)
    };
    this.registerSignalHandlers = options.registerSignalHandlers ?? false;
  }

  async run(): Promise<WhatsAppSyncReadinessResult> {
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

    let eventsCount = 0;
    let lastSyncType: number | string | null = null;
    let lastProgress: number | null = null;
    let isLatest = false;
    let lidPnMappingsCount = 0;
    let chatsCount = 0;
    let contactsCount = 0;
    let messagesCount = 0;
    let hasExplicitCompletion = false;

    let unsubscribeSync: (() => void) | null = null;

    try {
      if (this.connection.onHistorySync) {
        unsubscribeSync = this.connection.onHistorySync((stats: WhatsAppHistorySyncStats) => {
          eventsCount++;
          lastSyncType = stats.syncType;
          lastProgress = stats.progress;
          isLatest = stats.isLatest;
          lidPnMappingsCount = stats.lidPnMappingsCount;
          chatsCount = stats.chatsCount;
          contactsCount = stats.contactsCount;
          messagesCount = stats.messagesCount;

          // Sanitized metadata logging ONLY. Absolutely no text, no contact names, no phone numbers, no JIDs, no LIDs.
          this.logger.info('SYNC_EVENT_RECEIVED=YES');
          this.logger.info(`SYNC_TYPE=${stats.syncType !== null ? String(stats.syncType) : 'NONE'}`);
          this.logger.info(`SYNC_PROGRESS=${stats.progress !== null ? String(stats.progress) : 'NONE'}`);
          this.logger.info(`SYNC_IS_LATEST=${stats.isLatest ? 'YES' : 'NO'}`);
          this.logger.info(`SYNC_LID_PN_MAPPINGS_COUNT=${stats.lidPnMappingsCount}`);
          this.logger.info(`SYNC_CHATS_COUNT=${stats.chatsCount}`);
          this.logger.info(`SYNC_CONTACTS_COUNT=${stats.contactsCount}`);
          this.logger.info(`SYNC_MESSAGES_COUNT=${stats.messagesCount}`);

          if (stats.isLatest === true || stats.progress === 100) {
            hasExplicitCompletion = true;
          }
        });
      }

      await this.connection.start();

      // Phase 1: Wait for CONNECTED state
      const connectStart = Date.now();
      while (true) {
        if (aborted) {
          await this.safeClose();
          return this.buildResult('ABORTED', eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
        }

        const state = this.connection.getState();

        if (state === 'CONNECTED') {
          this.logger.info('WHATSAPP_CONNECTION=CONNECTED');
          break;
        }

        if (state === 'DEVICE_REMOVED') {
          this.logger.error('WHATSAPP_SYNC_READINESS=DEVICE_REMOVED');
          await this.safeClose();
          return this.buildResult('DEVICE_REMOVED', eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
        }

        if (state === 'LOGGED_OUT') {
          this.logger.error('WHATSAPP_SYNC_READINESS=LOGGED_OUT');
          await this.safeClose();
          return this.buildResult('LOGGED_OUT', eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
        }

        if (state === 'ERROR') {
          this.logger.error('WHATSAPP_SYNC_READINESS=FAIL');
          await this.safeClose();
          return this.buildResult('FAIL', eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
        }

        if (Date.now() - connectStart >= this.connectTimeoutMs) {
          this.logger.error('WHATSAPP_SYNC_READINESS=TIMEOUT');
          await this.safeClose();
          return this.buildResult('TIMEOUT', eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
        }

        await this.sleep(this.pollIntervalMs);
      }

      // Phase 2: Observation window for messaging-history.set
      const observationStart = Date.now();
      while (true) {
        if (aborted) {
          await this.safeClose();
          return this.buildResult('ABORTED', eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
        }

        const state = this.connection.getState();
        if (state === 'DEVICE_REMOVED') {
          this.logger.error('WHATSAPP_SYNC_READINESS=DEVICE_REMOVED');
          await this.safeClose();
          return this.buildResult('DEVICE_REMOVED', eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
        }

        if (state === 'LOGGED_OUT') {
          this.logger.error('WHATSAPP_SYNC_READINESS=LOGGED_OUT');
          await this.safeClose();
          return this.buildResult('LOGGED_OUT', eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
        }

        // Early completion if explicit completion signal was received
        if (hasExplicitCompletion) {
          break;
        }

        if (Date.now() - observationStart >= this.observationWindowMs) {
          break;
        }

        await this.sleep(this.pollIntervalMs);
      }

      // Phase 3: Evaluate sync readiness outcome
      let status: WhatsAppSyncReadinessStatus;
      if (hasExplicitCompletion) {
        status = 'COMPLETE';
      } else if (eventsCount > 0) {
        status = 'PARTIAL';
      } else {
        status = 'NO_EVENT';
      }

      this.logger.info(`WHATSAPP_SYNC_READINESS=${status}`);

      // Bounded, guaranteed final cleanup
      try {
        await this.connection.close();
      } catch (closeErr) {
        this.logger.error('WHATSAPP_SYNC_READINESS=CLEANUP_FAILED');
        return this.buildResult('FAIL', eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
      }

      return this.buildResult(status, eventsCount, lastSyncType, lastProgress, isLatest, lidPnMappingsCount, chatsCount, contactsCount, messagesCount);
    } finally {
      if (unsubscribeSync) {
        unsubscribeSync();
      }
      if (this.registerSignalHandlers && typeof process !== 'undefined') {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
      }
    }
  }

  private async safeClose(): Promise<void> {
    try {
      await this.connection.close();
    } catch {
      // Safe disposal
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildResult(
    status: WhatsAppSyncReadinessStatus,
    eventsCount: number,
    lastSyncType: number | string | null,
    lastProgress: number | null,
    isLatest: boolean,
    lidPnMappingsCount: number,
    chatsCount: number,
    contactsCount: number,
    messagesCount: number
  ): WhatsAppSyncReadinessResult {
    return {
      status,
      eventsCount,
      lastSyncType,
      lastProgress,
      isLatest,
      lidPnMappingsCount,
      chatsCount,
      contactsCount,
      messagesCount
    };
  }
}
