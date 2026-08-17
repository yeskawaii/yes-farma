export interface PasswordResetEmailMessage {
  to: string;
  firstName: string;
  resetUrl: string;
  expiresAt: Date;
}

export interface TransactionalEmailService {
  sendPasswordReset(
    message: PasswordResetEmailMessage,
  ): Promise<void>;
}
