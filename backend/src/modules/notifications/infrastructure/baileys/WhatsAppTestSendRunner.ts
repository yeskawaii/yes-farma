import { IWhatsAppConnection } from './IWhatsAppConnection';
import { INotificationDeliveryPort } from '../../domain/NotificationDeliveryPort';
import { BaileysNotificationDeliveryAdapter } from './BaileysNotificationDeliveryAdapter';

export const FIXED_TEST_SEND_MESSAGE = 'Prueba técnica de YESKIRA Dental. No requiere respuesta.';

export const isValidE164 = (phone: string): boolean => {
  return /^\+[1-9]\d{6,14}$/.test(phone);
};

export type WhatsAppTestSendStatus =
  | 'PASS'
  | 'FAIL'
  | 'AMBIGUOUS'
  | 'ABORTED'
  | 'TIMEOUT';

export interface WhatsAppTestSendResult {
  status: WhatsAppTestSendStatus;
  sendAttempted: boolean;
  providerMessageIdPresent?: boolean | undefined;
  failureCode?: string | undefined;
  cleanupFailed?: boolean | undefined;
  authPersistenceFailed?: boolean | undefined;
}

export interface WhatsAppTestSendRunnerOptions {
  connection: IWhatsAppConnection;
  deliveryPort?: INotificationDeliveryPort | undefined;
  to: string;
  confirm: string;
  timeoutMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  } | undefined;
  registerSignalHandlers?: boolean | undefined;
  onSendAttempt?: (() => void) | undefined;
  isSendAttempted?: (() => boolean) | undefined;
}

export class WhatsAppTestSendRunner {
  private readonly connection: IWhatsAppConnection;
  private readonly deliveryPort: INotificationDeliveryPort;
  private readonly to: string;
  private readonly confirm: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
  private readonly registerSignalHandlers: boolean;
  private readonly isSendAttemptedCustom?: (() => boolean) | undefined;
  private externalSendAttempted = false;

  constructor(options: WhatsAppTestSendRunnerOptions) {
    this.connection = options.connection;
    this.to = options.to;
    this.confirm = options.confirm;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.logger = options.logger ?? {
      info: (msg: string) => console.log(msg),
      error: (msg: string) => console.error(msg)
    };
    this.registerSignalHandlers = options.registerSignalHandlers ?? false;
    this.isSendAttemptedCustom = options.isSendAttempted;

    const recordSendAttempt = () => {
      this.externalSendAttempted = true;
      options.onSendAttempt?.();
    };

    this.deliveryPort =
      options.deliveryPort ??
      new BaileysNotificationDeliveryAdapter(this.connection, {
        onSendAttempt: recordSendAttempt
      });
  }

  private hasAttemptedSend(): boolean {
    if (this.externalSendAttempted) return true;
    if (this.isSendAttemptedCustom?.()) return true;
    return false;
  }

  async run(): Promise<WhatsAppTestSendResult> {
    // 1. Validar confirmación antes de abrir socket
    if (this.confirm !== 'YESKIRA_SEND_TEST') {
      this.logger.error('WHATSAPP_TEST_SEND=ABORTED');
      return {
        status: 'ABORTED',
        sendAttempted: false,
        failureCode: 'CONFIRMATION_INVALID'
      };
    }

    // 2. Validar recipient estricto E.164 antes de abrir socket
    if (!isValidE164(this.to)) {
      this.logger.error('WHATSAPP_TEST_SEND=INVALID_RECIPIENT');
      return {
        status: 'FAIL',
        sendAttempted: false,
        failureCode: 'INVALID_RECIPIENT'
      };
    }

    let cleanedUp = false;
    let cleanupError: unknown = null;

    const cleanupOnce = async (): Promise<unknown> => {
      if (cleanedUp) return cleanupError;
      cleanedUp = true;
      try {
        await this.connection.close();
      } catch (err: unknown) {
        cleanupError = err;
        return err;
      }
      return null;
    };

    let aborted = false;

    const onSignal = async () => {
      aborted = true;
      await cleanupOnce();
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
          await cleanupOnce();
          this.logger.error('WHATSAPP_TEST_SEND=ABORTED');
          return { status: 'ABORTED', sendAttempted: false };
        }

        const state = this.connection.getState();

        if (state === 'QR_REQUIRED') {
          await cleanupOnce();
          this.logger.error('WHATSAPP_TEST_SEND=FAIL');
          this.logger.error('SEND_ATTEMPTED=NO');
          this.logger.error('FAILURE_CODE=ERROR_SESSION_NOT_LINKED');
          return {
            status: 'FAIL',
            sendAttempted: false,
            failureCode: 'ERROR_SESSION_NOT_LINKED'
          };
        }

        if (state === 'LOGGED_OUT') {
          await cleanupOnce();
          this.logger.error('WHATSAPP_TEST_SEND=FAIL');
          this.logger.error('SEND_ATTEMPTED=NO');
          this.logger.error('FAILURE_CODE=ERROR_LOGGED_OUT');
          return {
            status: 'FAIL',
            sendAttempted: false,
            failureCode: 'ERROR_LOGGED_OUT'
          };
        }

        if (state === 'ERROR' || state === 'RECONNECTING') {
          await cleanupOnce();
          this.logger.error('WHATSAPP_TEST_SEND=FAIL');
          this.logger.error('SEND_ATTEMPTED=NO');
          this.logger.error('FAILURE_CODE=ERROR_CONNECTION');
          return {
            status: 'FAIL',
            sendAttempted: false,
            failureCode: 'ERROR_CONNECTION'
          };
        }

        if (state === 'CONNECTED') {
          return await this.executeSingleDelivery(cleanupOnce);
        }

        if (Date.now() - startTime >= this.timeoutMs) {
          await cleanupOnce();
          this.logger.error('WHATSAPP_TEST_SEND=FAIL');
          this.logger.error('SEND_ATTEMPTED=NO');
          this.logger.error('FAILURE_CODE=ERROR_TIMEOUT');
          return {
            status: 'TIMEOUT',
            sendAttempted: false,
            failureCode: 'ERROR_TIMEOUT'
          };
        }

        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }
    } catch {
      await cleanupOnce();
      const sendAttempted = this.hasAttemptedSend();
      this.logger.error('WHATSAPP_TEST_SEND=FAIL');
      this.logger.info(`SEND_ATTEMPTED=${sendAttempted ? 'YES' : 'NO'}`);
      this.logger.info('AUTOMATIC_RETRY=NO');
      this.logger.error('FAILURE_CODE=UNEXPECTED_ERROR');
      return {
        status: 'FAIL',
        sendAttempted,
        failureCode: 'UNEXPECTED_ERROR'
      };
    } finally {
      if (this.registerSignalHandlers && typeof process !== 'undefined') {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
      }
      await cleanupOnce();
    }
  }

  private async executeSingleDelivery(
    cleanupOnce: () => Promise<unknown>
  ): Promise<WhatsAppTestSendResult> {
    let deliveryResult;
    try {
      deliveryResult = await this.deliveryPort.deliver({
        channel: 'WHATSAPP',
        recipient: this.to,
        body: FIXED_TEST_SEND_MESSAGE,
        jobId: 'manual-smoke-test'
      });
    } catch {
      await cleanupOnce();
      const sendAttempted = this.hasAttemptedSend();
      this.logger.error('WHATSAPP_TEST_SEND=FAIL');
      this.logger.info(`SEND_ATTEMPTED=${sendAttempted ? 'YES' : 'NO'}`);
      this.logger.info('AUTOMATIC_RETRY=NO');
      this.logger.error('FAILURE_CODE=UNEXPECTED_ERROR');
      return {
        status: 'FAIL',
        sendAttempted,
        failureCode: 'UNEXPECTED_ERROR'
      };
    }

    const sendAttempted = this.hasAttemptedSend();

    if (deliveryResult.status === 'SENT') {
      if (!deliveryResult.providerMessageId) {
        await cleanupOnce();
        this.logger.error('WHATSAPP_TEST_SEND=AMBIGUOUS');
        this.logger.info(`SEND_ATTEMPTED=${sendAttempted ? 'YES' : 'NO'}`);
        this.logger.info('AUTOMATIC_RETRY=NO');
        this.logger.error('FAILURE_CODE=WHATSAPP_SEND_OUTCOME_UNKNOWN');
        return {
          status: 'AMBIGUOUS',
          sendAttempted,
          failureCode: 'WHATSAPP_SEND_OUTCOME_UNKNOWN'
        };
      }

      const err = await cleanupOnce();

      this.logger.info('WHATSAPP_TEST_SEND=PASS');
      this.logger.info('PROVIDER_MESSAGE_ID_PRESENT=YES');

      if (err instanceof Error && err.message === 'WHATSAPP_AUTH_PERSISTENCE_FAILED') {
        this.logger.error('AUTH_PERSISTENCE=FAIL');
        this.logger.info('AUTOMATIC_RETRY=NO');
        return {
          status: 'PASS',
          sendAttempted: true,
          providerMessageIdPresent: true,
          authPersistenceFailed: true
        };
      }

      if (err) {
        this.logger.error('CONNECTION_CLEANUP=FAIL');
        this.logger.info('AUTOMATIC_RETRY=NO');
        return {
          status: 'PASS',
          sendAttempted: true,
          providerMessageIdPresent: true,
          cleanupFailed: true
        };
      }

      return {
        status: 'PASS',
        sendAttempted: true,
        providerMessageIdPresent: true
      };
    }

    await cleanupOnce();

    if (deliveryResult.status === 'AMBIGUOUS_FAILURE') {
      this.logger.error('WHATSAPP_TEST_SEND=AMBIGUOUS');
      this.logger.info(`SEND_ATTEMPTED=${sendAttempted ? 'YES' : 'NO'}`);
      this.logger.info('AUTOMATIC_RETRY=NO');
      this.logger.error('FAILURE_CODE=WHATSAPP_SEND_OUTCOME_UNKNOWN');
      return {
        status: 'AMBIGUOUS',
        sendAttempted,
        failureCode: 'WHATSAPP_SEND_OUTCOME_UNKNOWN'
      };
    }

    if (deliveryResult.status === 'RETRYABLE_FAILURE') {
      this.logger.error('WHATSAPP_TEST_SEND=FAIL');
      this.logger.info(`SEND_ATTEMPTED=${sendAttempted ? 'YES' : 'NO'}`);
      this.logger.info('AUTOMATIC_RETRY=NO');
      this.logger.error(`FAILURE_CODE=${deliveryResult.failureCode || 'RETRYABLE_FAILURE'}`);
      return {
        status: 'FAIL',
        sendAttempted,
        failureCode: deliveryResult.failureCode || 'RETRYABLE_FAILURE'
      };
    }

    // PERMANENT_FAILURE or unhandled status
    this.logger.error('WHATSAPP_TEST_SEND=FAIL');
    this.logger.info(`SEND_ATTEMPTED=${sendAttempted ? 'YES' : 'NO'}`);
    this.logger.info('AUTOMATIC_RETRY=NO');
    this.logger.error(`FAILURE_CODE=${deliveryResult.failureCode || 'PERMANENT_FAILURE'}`);
    return {
      status: 'FAIL',
      sendAttempted,
      failureCode: deliveryResult.failureCode || 'PERMANENT_FAILURE'
    };
  }
}
