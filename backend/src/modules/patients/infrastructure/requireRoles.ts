import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './PatientController';
import { AppError } from '../../../shared/errors/AppError';

export const requireRoles = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = (req as AuthenticatedRequest).authContext;
    if (!ctx || !allowedRoles.includes(ctx.role)) {
      return next(new AppError('FORBIDDEN', 'No tienes permisos suficientes', 403));
    }
    next();
  };
};
