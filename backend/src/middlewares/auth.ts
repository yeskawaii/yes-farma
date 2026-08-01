import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { CryptoService } from '../modules/identity/infrastructure/CryptoService';
import { prisma } from '../infrastructure/database/prisma';
import { AppError } from '../shared/errors/AppError';

export interface AuthContext {
  userId: string;
  sessionId: string;
  clinicId: string;
  membershipId: string;
  role: string;
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies[env.SESSION_COOKIE_NAME];
    if (!rawToken) throw new AppError('UNAUTHORIZED', 'No autenticado.', 401);

    const tokenHash = CryptoService.hashSessionToken(rawToken);

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new AppError('UNAUTHORIZED', 'Sesión inválida o expirada.', 401);
    }

    if (session.user.status !== 'ACTIVE') {
      throw new AppError('ACCOUNT_DISABLED', 'Cuenta deshabilitada.', 403);
    }

    if (!session.activeClinicId) {
      throw new AppError('NO_ACTIVE_CLINIC', 'No hay clínica activa seleccionada.', 403);
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_clinicId: {
          userId: session.userId,
          clinicId: session.activeClinicId,
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new AppError('MEMBERSHIP_DISABLED', 'Membresía inactiva en esta clínica.', 403);
    }

    // Rate-limited updates to lastSeenAt (e.g. max once per 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (session.lastSeenAt < fiveMinutesAgo) {
      await prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      }).catch(console.error); // Do not await failure block
    }

    const ctx: AuthContext = {
      userId: session.userId,
      sessionId: session.id,
      clinicId: session.activeClinicId,
      membershipId: membership.id,
      role: membership.role,
    };

    (req as any).authContext = ctx;
    next();
  } catch (error) {
    next(error);
  }
};
