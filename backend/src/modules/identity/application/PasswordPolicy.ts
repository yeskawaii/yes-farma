import { AppError } from '../../../shared/errors/AppError';

export class PasswordPolicy {
  static readonly MIN_LENGTH = 15;
  static readonly MAX_LENGTH = 128;

  static validateNewPassword(password: string): void {
    // Array.from cuenta puntos de código Unicode, no bytes UTF-8.
    const length = Array.from(password).length;

    if (
      length < PasswordPolicy.MIN_LENGTH ||
      length > PasswordPolicy.MAX_LENGTH
    ) {
      throw new AppError(
        'WEAK_PASSWORD',
        `La contraseña debe tener entre ${PasswordPolicy.MIN_LENGTH} y ${PasswordPolicy.MAX_LENGTH} caracteres.`,
        400,
      );
    }
  }
}
