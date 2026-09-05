import {
  IWhatsAppRecipientResolver,
  ResolvedWhatsAppRecipient
} from './IWhatsAppRecipientResolver';
import { IWhatsAppRecipientQuery } from './IWhatsAppRecipientQuery';
import { isValidE164 } from './WhatsAppPhoneUtils';

export type OnWhatsAppQueryFn = (
  phone: string
) => Promise<Array<{ jid: string; exists: boolean }> | undefined>;

export class BaileysRecipientResolver implements IWhatsAppRecipientResolver {
  private readonly queryFn?: OnWhatsAppQueryFn | undefined;

  constructor(queryOrFn?: IWhatsAppRecipientQuery | OnWhatsAppQueryFn | undefined) {
    if (queryOrFn && typeof queryOrFn === 'object' && 'queryRegisteredRecipient' in queryOrFn) {
      this.queryFn = (phone: string) => queryOrFn.queryRegisteredRecipient(phone);
    } else if (typeof queryOrFn === 'function') {
      this.queryFn = queryOrFn;
    } else {
      this.queryFn = undefined;
    }
  }

  async resolveRecipient(recipient: string): Promise<ResolvedWhatsAppRecipient> {
    // 1. Detect if input is a WhatsApp LID (ends with @lid or has @lid)
    if (recipient.endsWith('@lid') || recipient.includes('@lid')) {
      return {
        canonicalJid: recipient,
        exists: true,
        isLid: true
      };
    }

    // 2. Validate strict E.164 phone
    if (!isValidE164(recipient)) {
      return {
        canonicalJid: '',
        exists: false,
        isLid: false
      };
    }

    // 3. Fail closed: If no query backend provided, NEVER craft JID or claim exists
    if (!this.queryFn) {
      return {
        canonicalJid: '',
        exists: false,
        isLid: false
      };
    }

    // 4. Query WhatsApp via socket.onWhatsApp
    try {
      const results = await this.queryFn(recipient);
      const match = results?.[0];
      if (!match || !match.exists || !match.jid) {
        return {
          canonicalJid: '',
          exists: false,
          isLid: false
        };
      }

      const isLid = Boolean(match.jid.endsWith('@lid') || match.jid.includes('@lid'));
      return {
        canonicalJid: match.jid,
        exists: true,
        isLid
      };
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message === 'WHATSAPP_QUERY_NOT_SUPPORTED' ||
          err.message === 'WHATSAPP_NOT_CONNECTED')
      ) {
        throw err;
      }
      return {
        canonicalJid: '',
        exists: false,
        isLid: false
      };
    }
  }
}
