export type WhatsAppDeliveryProgressState =
  | 'SUBMITTED'             // sendMessage resolved locally with providerMessageId (key.id)
  | 'SERVER_ACKNOWLEDGED'    // Baileys received SERVER_ACK from WhatsApp servers (1 checkmark)
  | 'DELIVERED'             // Baileys received DELIVERY_ACK from recipient device (2 checkmarks)
  | 'FAILED'                // Provider or transport error
  | 'AMBIGUOUS';            // Boundary crossed, timeout or unknown outcome

export interface WhatsAppMessageAckUpdate {
  providerMessageId: string;
  status: WhatsAppDeliveryProgressState;
  timestamp: Date;
}
