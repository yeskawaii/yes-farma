export interface ResolvedWhatsAppRecipient {
  canonicalJid: string;
  exists: boolean;
  isLid?: boolean | undefined;
}

export interface IWhatsAppRecipientResolver {
  resolveRecipient(recipient: string): Promise<ResolvedWhatsAppRecipient>;
}
