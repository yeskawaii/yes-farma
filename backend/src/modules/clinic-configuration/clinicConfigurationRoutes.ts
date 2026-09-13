import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma';
import { authMiddleware, type AuthContext } from '../../middlewares/auth';
import { validateOrigin } from '../../middlewares/validateOrigin';
import { AppError } from '../../shared/errors/AppError';
import { ClinicConfigurationService } from './ClinicConfigurationService';
const service = new ClinicConfigurationService(prisma);
export const clinicConfigurationRoutes = Router();
const handle = (operation: 'update' | 'switchClinic'): RequestHandler => async (req, res, next) => {
  try {
    const ctx = (req as typeof req & { authContext: AuthContext }).authContext;
    res.json(await service[operation](ctx, req.body));
  } catch (error) {
    next(error instanceof z.ZodError ? new AppError('VALIDATION_ERROR', 'Configuración inválida.', 400) : error);
  }
};
clinicConfigurationRoutes.patch('/clinic-configuration', authMiddleware, validateOrigin, handle('update'));
clinicConfigurationRoutes.post('/auth/active-clinic', authMiddleware, validateOrigin, handle('switchClinic'));
