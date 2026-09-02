export type PhoneNormalizationResult =
  | { valid: true; e164: string }
  | { valid: false; error: 'MISSING' | 'INVALID' };

export class PhoneNormalizer {
  /**
   * Normalizes a phone number to standard E.164 format (+[countryCode][nationalNumber]).
   *
   * @param rawPhone Patient or recipient phone input
   * @param defaultCountryCallingCode Default country calling code without '+' (e.g. "52")
   */
  static normalize(
    rawPhone: string | null | undefined,
    defaultCountryCallingCode = '52'
  ): PhoneNormalizationResult {
    if (!rawPhone || typeof rawPhone !== 'string') {
      return { valid: false, error: 'MISSING' };
    }

    const trimmed = rawPhone.trim();
    if (!trimmed) {
      return { valid: false, error: 'MISSING' };
    }

    // Clean country calling code of any '+' or formatting
    const cleanDefaultCountry = defaultCountryCallingCode.replace(/\D/g, '') || '52';

    if (trimmed.startsWith('+')) {
      const stripped = trimmed.slice(1).replace(/[\s\-\(\)\.]/g, '');
      // Must contain only digits and be between 8 and 15 digits
      if (!/^\d{8,15}$/.test(stripped)) {
        return { valid: false, error: 'INVALID' };
      }
      return { valid: true, e164: `+${stripped}` };
    }

    // No leading '+', strip formatting
    const stripped = trimmed.replace(/[\s\-\(\)\.]/g, '');
    if (!/^\d+$/.test(stripped)) {
      return { valid: false, error: 'INVALID' };
    }

    // If exactly 10 digits (standard national number in MX and many countries)
    if (stripped.length === 10) {
      const e164 = `+${cleanDefaultCountry}${stripped}`;
      const digitsOnly = e164.slice(1);
      if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
        return { valid: true, e164 };
      }
      return { valid: false, error: 'INVALID' };
    }

    // If already starts with defaultCountryCallingCode and total length is 8..15 digits
    if (
      stripped.startsWith(cleanDefaultCountry) &&
      stripped.length >= 8 &&
      stripped.length <= 15
    ) {
      return { valid: true, e164: `+${stripped}` };
    }

    return { valid: false, error: 'INVALID' };
  }
}
