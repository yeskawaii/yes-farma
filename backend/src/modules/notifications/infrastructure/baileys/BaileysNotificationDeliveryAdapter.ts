import { INotificationDeliveryPort } from '../../domain/NotificationDeliveryPort';
import {
  NotificationDeliveryParams,
  NotificationDeliveryResult
} from '../../domain/NotificationTypes';
import { IWhatsAppConnection } from './IWhatsAppConnection';
import { BaileysDeliveryErrorClassifier } from './BaileysDeliveryErrorClassifier';
import { BaileysFailureCodes } from './BaileysTypes';

export class BaileysNotificationDeliveryAdapter implements INotificationDeliveryPort {
  constructor(
    private readonly connection: IWhatsAppConnection,
    private readonly errorClassifier: BaileysDeliveryErrorClassifier = new BaileysDeliveryErrorClassifier()
  ) {}

  async deliver(params: NotificationDeliveryParams): Promise<NotificationDeliveryResult> {
    if (params.channel !== 'WHATSAPP') {
      return {
        status: 'PERMANENT_FAILURE',
        failureCode: BaileysFailureCodes.UNSUPPORTED_NOTIFICATION_CHANNEL
      };
    }

    // Validate E.164 format: + followed by 8 to 15 digits
    const e164Regex = /^\+[1-9]\d{7,14}$/;
    if (!e164Regex.test(params.recipient)) {
      return {
        status: 'PERMANENT_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_RECIPIENT_INVALID
      };
    }

    const sender = this.connection.getMessageSender();
    if (!sender || this.connection.getState() !== 'CONNECTED') {
      return {
        status: 'RETRYABLE_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_NOT_CONNECTED
      };
    }

    // Convert E.164 to Baileys WhatsApp JID exclusively in infrastructure layer
    const digitsOnly = params.recipient.replace(/^\+/, '');
    const jid = `${digitsOnly}@s.whatsapp.net`;

    try {
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
