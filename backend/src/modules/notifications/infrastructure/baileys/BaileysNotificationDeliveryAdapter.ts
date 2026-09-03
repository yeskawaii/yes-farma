import { INotificationDeliveryPort } from '../../domain/NotificationDeliveryPort';
import {
  NotificationDeliveryParams,
  NotificationDeliveryResult
} from '../../domain/NotificationTypes';
import { IWhatsAppConnection } from './IWhatsAppConnection';
import { BaileysDeliveryErrorClassifier } from './BaileysDeliveryErrorClassifier';
import { BaileysFailureCodes } from './BaileysTypes';
import { IWhatsAppRecipientResolver } from './IWhatsAppRecipientResolver';
import { BaileysRecipientResolver } from './BaileysRecipientResolver';

export interface BaileysNotificationDeliveryAdapterOptions {
  errorClassifier?: BaileysDeliveryErrorClassifier | undefined;
  onSendAttempt?: (() => void) | undefined;
  recipientResolver?: IWhatsAppRecipientResolver | undefined;
}

export class BaileysNotificationDeliveryAdapter implements INotificationDeliveryPort {
  private readonly errorClassifier: BaileysDeliveryErrorClassifier;
  private readonly onSendAttempt?: (() => void) | undefined;
  private readonly recipientResolver: IWhatsAppRecipientResolver;

  constructor(
    private readonly connection: IWhatsAppConnection,
    errorClassifierOrOptions?: BaileysDeliveryErrorClassifier | BaileysNotificationDeliveryAdapterOptions
  ) {
    if (errorClassifierOrOptions && 'onSendAttempt' in errorClassifierOrOptions) {
      this.errorClassifier = errorClassifierOrOptions.errorClassifier ?? new BaileysDeliveryErrorClassifier();
      this.onSendAttempt = errorClassifierOrOptions.onSendAttempt;
      this.recipientResolver = errorClassifierOrOptions.recipientResolver ?? this.createDefaultResolver();
    } else if (errorClassifierOrOptions && 'recipientResolver' in errorClassifierOrOptions) {
      this.errorClassifier = errorClassifierOrOptions.errorClassifier ?? new BaileysDeliveryErrorClassifier();
      this.onSendAttempt = errorClassifierOrOptions.onSendAttempt;
      this.recipientResolver = errorClassifierOrOptions.recipientResolver ?? this.createDefaultResolver();
    } else if (errorClassifierOrOptions instanceof BaileysDeliveryErrorClassifier) {
      this.errorClassifier = errorClassifierOrOptions;
      this.onSendAttempt = undefined;
      this.recipientResolver = this.createDefaultResolver();
    } else {
      this.errorClassifier = new BaileysDeliveryErrorClassifier();
      this.onSendAttempt = undefined;
      this.recipientResolver = this.createDefaultResolver();
    }
  }

  private createDefaultResolver(): IWhatsAppRecipientResolver {
    if (
      this.connection &&
      typeof (this.connection as any).queryRegisteredRecipient === 'function'
    ) {
      return new BaileysRecipientResolver(this.connection as any);
    }
    return new BaileysRecipientResolver();
  }

  async deliver(params: NotificationDeliveryParams): Promise<NotificationDeliveryResult> {
    if (params.channel !== 'WHATSAPP') {
      return {
        status: 'PERMANENT_FAILURE',
        failureCode: BaileysFailureCodes.UNSUPPORTED_NOTIFICATION_CHANNEL
      };
    }

    const sender = this.connection.getMessageSender();
    if (!sender || this.connection.getState() !== 'CONNECTED') {
      return {
        status: 'RETRYABLE_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_NOT_CONNECTED
      };
    }

    const resolved = await this.recipientResolver.resolveRecipient(params.recipient);
    if (!resolved.exists || !resolved.canonicalJid) {
      return {
        status: 'PERMANENT_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_RECIPIENT_INVALID
      };
    }

    if (resolved.isLid) {
      return {
        status: 'PERMANENT_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_RECIPIENT_INVALID
      };
    }

    const jid = resolved.canonicalJid;

    try {
      this.onSendAttempt?.();
      const result = await sender.sendMessage(jid, { text: params.body });
      const providerMessageId = result?.key?.id;

      if (providerMessageId && typeof providerMessageId === 'string' && providerMessageId.trim() !== '') {
        return {
          status: 'SENT',
          providerMessageId
        };
      }

      // If sendMessage resolves without a valid provider key.id, classify as AMBIGUOUS_FAILURE
      return {
        status: 'AMBIGUOUS_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN
      };
    } catch (error) {
      return this.errorClassifier.classify(error, { phase: 'SEND_STARTED' });
    }
  }
}
