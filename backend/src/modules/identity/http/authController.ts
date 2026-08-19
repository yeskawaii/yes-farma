import type { CookieOptions, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../application/AuthService';
import { PasswordRecoveryService } from '../application/PasswordRecoveryService';
import { CryptoService } from '../infrastructure/CryptoService';
import { getTransactionalEmailService } from '../infrastructure/TransactionalEmailProvider';
import { env } from '../../../config/env';
import { prisma } from '../../../infrastructure/database/prisma';

const loginSchema = z.object({
  email: z.string().email('Email inválido.'),
  password: z.string().min(1, 'La contraseña es requerida.'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido.'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'El token es requerido.'),
  newPassword: z.string().min(1, 'La contraseña es requerida.'),
});

const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

export const authController = {
  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'INVALID_INPUT', message: 'Datos de entrada inválidos.' },
        });
        return;
      }

      const { email, password } = parsed.data;
      const { rawToken, expiresAt } = await AuthService.login(email, password, req.ip, req.headers['user-agent']);

      res.cookie(env.SESSION_COOKIE_NAME, rawToken, {
        ...sessionCookieOptions,
        expires: expiresAt,
      });

      res.status(200).json({ message: 'Login exitoso.' });
    } catch (error) {
      next(error);
    }
  },

  logout: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = req.cookies[env.SESSION_COOKIE_NAME];
      if (rawToken) {
        const tokenHash = CryptoService.hashSessionToken(rawToken);
        await AuthService.logout(tokenHash, req.ip, req.headers['user-agent']);
      }

      res.clearCookie(env.SESSION_COOKIE_NAME, sessionCookieOptions);
      res.status(200).json({ message: 'Logout exitoso.' });
    } catch (error) {
      next(error);
    }
  },

  forgotPassword: async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Datos de entrada inválidos.',
          },
        });
        return;
      }

      const emailService = getTransactionalEmailService();

      await PasswordRecoveryService.requestReset(
        parsed.data.email,
        emailService,
      );

      // La respuesta es deliberadamente idéntica exista o no la cuenta.
      res.status(200).json({
        message:
          'Si existe una cuenta asociada a ese correo, enviaremos instrucciones para restablecer la contraseña.',
      });
    } catch (error) {
      next(error);
    }
  },

  resetPassword: async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Datos de entrada inválidos.',
          },
        });
        return;
      }

      await PasswordRecoveryService.resetPassword(
        parsed.data.token,
        parsed.data.newPassword,
      );

      res.status(200).json({
        message: 'Contraseña actualizada correctamente.',
      });
    } catch (error) {
      next(error);
    }
  },

  me: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = (req as any).authContext;
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      const memberships = await prisma.membership.findMany({
        where: { userId: ctx.userId, status: 'ACTIVE' },
        include: { clinic: true, profile: true },
      });

      res.status(200).json({
        user,
        memberships: memberships.map((m) => ({
          id: m.id,
          clinicId: m.clinicId,
          clinicName: m.clinic.name,
          role: m.role,
          specialtyCode: m.profile?.specialtyCode,
        })),
        activeClinicId: ctx.clinicId,
        activeRole: ctx.role,
      });
    } catch (error) {
      next(error);
    }
  },
};
