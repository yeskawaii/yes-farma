import { isBoom } from '@hapi/boom';
import { NotificationDeliveryResult } from '../../domain/NotificationTypes';
import { BaileysFailureCodes } from './BaileysTypes';

export interface ClassifyErrorContext {
  phase?: 'PRE_SEND' | 'SEND_STARTED';
}

export class BaileysDeliveryErrorClassifier {
  classify(error: unknown, context?: ClassifyErrorContext): NotificationDeliveryResult {
    const phase = context?.phase ?? 'SEND_STARTED';

    let statusCode: number | undefined;
    if (isBoom(error)) {
      statusCode = error.output.statusCode;
    } else if (error && typeof error === 'object' && 'output' in error && typeof (error as any).output?.statusCode === 'number') {
      statusCode = (error as any).output.statusCode;
    } else if (error && typeof error === 'object' && 'statusCode' in error && typeof (error as any).statusCode === 'number') {
      statusCode = (error as any).statusCode;
    }

    // 401 is always terminal PERMANENT_FAILURE (logged out / revoked session)
    if (statusCode === 401) {
      return {
        status: 'PERMANENT_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_LOGGED_OUT
      };
    }

    // Explicit bad recipient errors are PERMANENT_FAILURE
    if (statusCode === 400 || statusCode === 404) {
      return {
        status: 'PERMANENT_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_RECIPIENT_INVALID
      };
    }

    const msg = error instanceof Error ? error.message.toLowerCase() : '';

    if (msg.includes('invalid jid') || msg.includes('bad recipient') || msg.includes('invalid recipient')) {
      return {
        status: 'PERMANENT_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_RECIPIENT_INVALID
      };
    }

    if (msg.includes('logged out') || msg.includes('unauthorized')) {
      return {
        status: 'PERMANENT_FAILURE',
        failureCode: BaileysFailureCodes.WHATSAPP_LOGGED_OUT
      };
    }

    // PRE_SEND: transport errors before transmission has begun can be safely retried
    if (phase === 'PRE_SEND') {
      if (
        statusCode === 428 ||
        statusCode === 408 ||
        statusCode === 440 ||
        statusCode === 503 ||
        statusCode === 515 ||
        msg.includes('connection closed') ||
        msg.includes('not connected') ||
        msg.includes('socket closed') ||
        msg.includes('websocket') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset')
      ) {
        return {
          status: 'RETRYABLE_FAILURE',
          failureCode: BaileysFailureCodes.WHATSAPP_NOT_CONNECTED
        };
      }
    }

    // SEND_STARTED: any transport failure, timeout, or unknown error after sendMessage began
    // is AMBIGUOUS_FAILURE to conservatively prevent duplicate messages
    return {
      status: 'AMBIGUOUS_FAILURE',
      failureCode: BaileysFailureCodes.WHATSAPP_SEND_OUTCOME_UNKNOWN
    };
  }
}
