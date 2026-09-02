import { useMultiFileAuthState, AuthenticationState } from '@whiskeysockets/baileys';
import { IWhatsAppAuthStateStore } from './IWhatsAppAuthStateStore';

export class MultiFileAuthStateStore implements IWhatsAppAuthStateStore {
  constructor(private readonly authDir: string) {
    if (!authDir || authDir.trim() === '') {
      throw new Error('authDir is required and cannot be empty');
    }
  }

  getAuthDir(): string {
    return this.authDir;
  }

  async getAuthState(): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    return useMultiFileAuthState(this.authDir);
  }
}
