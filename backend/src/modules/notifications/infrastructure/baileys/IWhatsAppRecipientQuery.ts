export interface IWhatsAppRecipientQuery {
  queryRegisteredRecipient(phone: string): Promise<Array<{ jid: string; exists: boolean }>>;
}
