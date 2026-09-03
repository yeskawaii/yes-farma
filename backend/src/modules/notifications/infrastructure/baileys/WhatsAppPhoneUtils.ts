/**
 * Strict international E.164 phone number validator:
 * - Must start with '+'
 * - Followed by a non-zero digit 1-9 (international country codes cannot start with 0)
 * - Followed by 6 to 14 digits (7 to 15 digits total, strictly adhering to ITU-T E.164 standard)
 * - Prohibits spaces, hyphens, parentheses, letters, or WhatsApp JID/LID suffixes (@s.whatsapp.net, @lid).
 */
export const isValidE164 = (phone: string | null | undefined): boolean => {
  if (!phone || typeof phone !== 'string') return false;
  return /^\+[1-9]\d{6,14}$/.test(phone);
};
