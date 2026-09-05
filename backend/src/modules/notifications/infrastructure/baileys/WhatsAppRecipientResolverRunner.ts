import { IWhatsAppConnection } from './IWhatsAppConnection';
import { IWhatsAppRecipientResolver } from './IWhatsAppRecipientResolver';

export type WhatsAppRecipientResolverStatus =
  | 'PASS'
  | 'FAIL'
  | 'DEVICE_REMOVED'
  | 'LOGGED_OUT'
  | 'TIMEOUT'
  | 'ABORTED';

export type CanonicalJidKind = 'PHONE' | 'LID' | 'OTHER' | 'NONE';

export interface WhatsAppRecipientResolverResult {
  status: WhatsAppRecipientResolverStatus;
  exists: boolean;
  canonicalJidPresent: boolean;
  canonicalJidKind: CanonicalJidKind;
  sendMessageCalled: false;
  automaticRetry: false;
  failureCode?: string | undefined;
}

export interface WhatsAppRecipientResolverRunnerOptions {
  connection: IWhatsAppConnection;
  recipientResolver: IWhatsAppRecipientResolver;
  to: string;
  timeoutMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  } | undefined;
  registerSignalHandlers?: boolean | undefined;
}

export class WhatsAppRecipientResolverRunner {
  private readonly connection: IWhatsAppConnection;
  private readonly recipientResolver: IWhatsAppRecipientResolver;
  private readonly to: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
  private readonly registerSignalHandlers: boolean;

  constructor(options: WhatsAppRecipientResolverRunnerOptions) {
    this.connection = options.connection;
    this.recipientResolver = options.recipientResolver;
    this.to = options.to;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.logger = options.logger ?? {
      info: (msg: string) => console.log(msg),
      error: (msg: string) => console.error(msg)
    };
    this.registerSignalHandlers = options.registerSignalHandlers ?? false;
  }

  async run(): Promise<WhatsAppRecipientResolverResult> {
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
          return {
            status: 'ABORTED',
            exists: false,
            canonicalJidPresent: false,
            canonicalJidKind: 'NONE',
            sendMessageCalled: false,
            automaticRetry: false,
            failureCode: 'ABORTED'
          };
        }

        const state = this.connection.getState();

        if (state === 'CONNECTED') {
          this.logger.info('WHATSAPP_CONNECTION=CONNECTED');
          break;
        }

        if (state === 'DEVICE_REMOVED') {
          this.logger.error('WHATSAPP_CONNECTION=DEVICE_REMOVED');
          return {
            status: 'DEVICE_REMOVED',
            exists: false,
            canonicalJidPresent: false,
            canonicalJidKind: 'NONE',
            sendMessageCalled: false,
            automaticRetry: false,
            failureCode: 'WHATSAPP_DEVICE_REMOVED'
          };
        }

        if (state === 'LOGGED_OUT') {
          this.logger.error('WHATSAPP_CONNECTION=LOGGED_OUT');
          return {
            status: 'LOGGED_OUT',
            exists: false,
            canonicalJidPresent: false,
            canonicalJidKind: 'NONE',
            sendMessageCalled: false,
            automaticRetry: false,
            failureCode: 'WHATSAPP_LOGGED_OUT'
          };
        }

        if (Date.now() - startTime >= this.timeoutMs) {
          this.logger.error('WHATSAPP_CONNECTION=TIMEOUT');
          return {
            status: 'TIMEOUT',
            exists: false,
            canonicalJidPresent: false,
            canonicalJidKind: 'NONE',
            sendMessageCalled: false,
            automaticRetry: false,
            failureCode: 'WHATSAPP_TIMEOUT'
          };
        }

        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }

      // Check query backend availability
      if (typeof (this.connection as any).queryRegisteredRecipient !== 'function') {
        this.logger.error('RECIPIENT_QUERY=FAIL');
        return {
          status: 'FAIL',
          exists: false,
          canonicalJidPresent: false,
          canonicalJidKind: 'NONE',
          sendMessageCalled: false,
          automaticRetry: false,
          failureCode: 'WHATSAPP_QUERY_NOT_SUPPORTED'
        };
      }

      // Perform resolution via existing recipient resolver
      let resolved;
      try {
        resolved = await this.recipientResolver.resolveRecipient(this.to);
      } catch (queryErr: unknown) {
        this.logger.error('RECIPIENT_QUERY=FAIL');
        const failureCode = this.extractFailureCode(queryErr);
        return {
          status: 'FAIL',
          exists: false,
          canonicalJidPresent: false,
          canonicalJidKind: 'NONE',
          sendMessageCalled: false,
          automaticRetry: false,
          failureCode
        };
      }

      this.logger.info('RECIPIENT_QUERY=PASS');
      this.logger.info(`RECIPIENT_EXISTS=${resolved.exists ? 'YES' : 'NO'}`);

      const hasCanonicalJid = Boolean(resolved.canonicalJid && resolved.canonicalJid.trim() !== '');
      let kind: CanonicalJidKind = 'NONE';
      if (hasCanonicalJid) {
        if (resolved.canonicalJid.endsWith('@s.whatsapp.net')) {
          kind = 'PHONE';
        } else if (resolved.canonicalJid.endsWith('@lid') || resolved.isLid) {
          kind = 'LID';
        } else {
          kind = 'OTHER';
        }
      }

      this.logger.info(`CANONICAL_JID_PRESENT=${hasCanonicalJid ? 'YES' : 'NO'}`);
      this.logger.info(`CANONICAL_JID_KIND=${kind}`);
      this.logger.info('SEND_MESSAGE_CALLED=NO');
      this.logger.info('AUTOMATIC_RETRY=NO');

      return {
        status: 'PASS',
        exists: resolved.exists,
        canonicalJidPresent: hasCanonicalJid,
        canonicalJidKind: kind,
        sendMessageCalled: false,
        automaticRetry: false
      };
    } catch (err: unknown) {
      this.logger.error('WHATSAPP_CONNECTION=FAIL');
      const failureCode = this.extractFailureCode(err);
      return {
        status: 'FAIL',
        exists: false,
        canonicalJidPresent: false,
        canonicalJidKind: 'NONE',
        sendMessageCalled: false,
        automaticRetry: false,
        failureCode
      };
    } finally {
      if (this.registerSignalHandlers && typeof process !== 'undefined') {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
      }
    }
  }

  private extractFailureCode(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = String((err as { message: unknown }).message);
      if (msg === 'WHATSAPP_QUERY_NOT_SUPPORTED') return 'WHATSAPP_QUERY_NOT_SUPPORTED';
      if (msg === 'WHATSAPP_NOT_CONNECTED') return 'WHATSAPP_NOT_CONNECTED';
      if (msg === 'WHATSAPP_DEVICE_REMOVED') return 'WHATSAPP_DEVICE_REMOVED';
      if (msg === 'WHATSAPP_LOGGED_OUT') return 'WHATSAPP_LOGGED_OUT';
      if (msg === 'WHATSAPP_CONNECTION_CLOSED') return 'WHATSAPP_CONNECTION_CLOSED';
    }
    return 'UNEXPECTED_ERROR';
  }
}
