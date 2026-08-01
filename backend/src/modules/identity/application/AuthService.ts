import { prisma } from '../../../infrastructure/database/prisma';
import { CryptoService } from '../infrastructure/CryptoService';
import { AppError } from '../../../shared/errors/AppError';
import { env } from '../../../config/env';

export class AuthService {
  static async login(email: string, passwordRaw: string, ipAddress?: string, userAgent?: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { clinic: true },
        },
      },
    });

    if (!user || !(await CryptoService.verifyPassword(passwordRaw, user.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', 'Credenciales incorrectas.', 401);
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError('ACCOUNT_DISABLED', 'Cuenta deshabilitada.', 403);
    }

    if (user.memberships.length === 0) {
      throw new AppError('NO_ACTIVE_MEMBERSHIPS', 'No tienes membresías activas.', 403);
    }

    let activeClinicId: string | null = null;
    if (user.memberships.length === 1) {
      const firstMembership = user.memberships[0];
      if (firstMembership) {
        activeClinicId = firstMembership.clinicId;
      }
    }

    const rawToken = CryptoService.generateSessionToken();
    const tokenHash = CryptoService.hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600000);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        activeClinicId,
        tokenHash,
        expiresAt,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await prisma.auditEvent.create({
      data: {
        clinicId: activeClinicId,
        actorUserId: user.id,
        action: 'LOGIN',
        entityType: 'User',
        entityId: user.id,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return { rawToken, expiresAt };
  }

  static async logout(tokenHash: string, ipAddress?: string, userAgent?: string) {
    const session = await prisma.session.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return; // Idempotent
    }

    await prisma.session.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });

    await prisma.auditEvent.create({
      data: {
        clinicId: session.activeClinicId,
        actorUserId: session.userId,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: session.userId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });
  }
}
