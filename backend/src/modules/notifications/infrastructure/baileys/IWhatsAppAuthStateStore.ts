import type { AuthenticationState } from '@whiskeysockets/baileys';

export interface IWhatsAppAuthStateStore {
  getAuthState(): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }>;
}
