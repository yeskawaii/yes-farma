import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from '../shared/errors/AppError';

export const validateOrigin = (req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer;
    if (origin && !origin.startsWith(env.APP_ORIGIN)) {
      return next(new AppError('INVALID_ORIGIN', 'Origen no permitido.', 403));
    }
  }
  next();
};
