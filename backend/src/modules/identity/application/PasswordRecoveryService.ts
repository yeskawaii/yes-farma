import { prisma } from '../../../infrastructure/database/prisma';
import { env } from '../../../config/env';
import { AppError } from '../../../shared/errors/AppError';
import { CryptoService } from '../infrastructure/CryptoService';
import { PasswordPolicy } from './PasswordPolicy';
import { PwnedPasswordService } from '../infrastructure/PwnedPasswordService';
import { TransactionalEmailService } from '../infrastructure/TransactionalEmailService';

export type PasswordCompromiseChecker = (
  password: string,
) => Promise<void>;

const invalidResetTokenError = () =>
  new AppError(
    'INVALID_RESET_TOKEN',
    'Este enlace ya no es válido. Solicita uno nuevo para continuar.',
    400,
  );

export class PasswordRecoveryService {
  static async requestReset(
    email: string,
    emailService: TransactionalEmailService,
  ): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        status: true,
      },
    });

    // La respuesta HTTP posterior será idéntica exista o no la cuenta.
    // Tampoco generamos una credencial utilizable para cuentas deshabilitadas.
    if (!user || user.status !== 'ACTIVE') {
      return;
    }

    const rawToken = CryptoService.generatePasswordResetToken();
    const tokenHash = CryptoService.hashPasswordResetToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + env.PASSWORD_RESET_TTL_MINUTES * 60_000,
    );

    await prisma.$transaction(async (tx) => {
      // Un nuevo request invalida cualquier enlace pendiente anterior.
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      await tx.auditEvent.create({
        data: {
          clinicId: null,
          actorUserId: null,
          action: 'PASSWORD_RESET_REQUESTED',
          entityType: 'User',
          entityId: user.id,
        },
      });
    });

    // El raw token nunca se persiste ni regresa al cliente HTTP.
    // Solo se incorpora al enlace destinado al correo transaccional.
    const resetUrl = new URL('/reset-password', env.APP_ORIGIN);
    resetUrl.searchParams.set('token', rawToken);

    try {
      await emailService.sendPasswordReset({
        to: user.email,
        firstName: user.firstName,
        resetUrl: resetUrl.toString(),
        expiresAt,
      });
    } catch (error: unknown) {
      const failedAt = new Date();

      await prisma.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: failedAt },
      });

      if (error instanceof AppError && error.code === 'EMAIL_DELIVERY_UNAVAILABLE') {

        try {
          await prisma.auditEvent.create({
            data: {
              clinicId: null,
              actorUserId: null,
              action: 'PASSWORD_RESET_EMAIL_FAILED',
              entityType: 'User',
              entityId: user.id,
              success: false,
            },
          });
        } catch (auditError) {
          console.error('Error registrando audit event para falla de correo');
        }

        return;
      }
      throw error;
    }
  }

  static async resetPassword(
    rawToken: string,
    newPassword: string,
    compromiseChecker: PasswordCompromiseChecker = (password) =>
      PwnedPasswordService.assertNotCompromised(password),
  ): Promise<void> {
    const tokenHash = CryptoService.hashPasswordResetToken(rawToken);
    const now = new Date();

    const token = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        usedAt: true,
        expiresAt: true,
      },
    });

    if (!token || token.usedAt || token.expiresAt <= now) {
      throw invalidResetTokenError();
    }

    PasswordPolicy.validateNewPassword(newPassword);

    // La comprobación de contraseña comprometida ocurre antes de scrypt
    // y antes de consumir el token. Si HIBP no está disponible, falla cerrado.
    await compromiseChecker(newPassword);

    // El hash costoso se calcula fuera de la transacción para no mantener
    // locks de BD durante scrypt.
    const newPasswordHash = await CryptoService.hashPassword(newPassword);

    // Debe calcularse DESPUÉS de scrypt: el token pudo expirar mientras
    // se derivaba el nuevo password hash.
    const consumeAt = new Date();

    await prisma.$transaction(async (tx) => {
      // Compare-and-set: solo una ejecución concurrente puede consumirlo.
      const consumeResult = await tx.passwordResetToken.updateMany({
        where: {
          id: token.id,
          userId: token.userId,
          tokenHash,
          usedAt: null,
          expiresAt: {
            gt: consumeAt,
          },
        },
        data: {
          usedAt: consumeAt,
        },
      });

      if (consumeResult.count !== 1) {
        throw invalidResetTokenError();
      }

      await tx.user.update({
        where: { id: token.userId },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      // Invalida cualquier otro reset pendiente de la misma cuenta.
      await tx.passwordResetToken.updateMany({
        where: {
          userId: token.userId,
          id: {
            not: token.id,
          },
          usedAt: null,
        },
        data: {
          usedAt: consumeAt,
        },
      });

      // Un reset de contraseña es un evento de seguridad: todas las
      // sesiones existentes quedan revocadas.
      await tx.session.updateMany({
        where: {
          userId: token.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: consumeAt,
        },
      });

      await tx.auditEvent.create({
        data: {
          clinicId: null,
          actorUserId: token.userId,
          action: 'PASSWORD_RESET_COMPLETED',
          entityType: 'User',
          entityId: token.userId,
        },
      });
    });
  }
}
