import { Request, Response, NextFunction } from 'express';
import { allowedAppOriginSet } from '../config/appOrigins';
import { AppError } from '../shared/errors/AppError';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const resolveRequestOrigin = (req: Request): string | null => {
  const origin = req.headers.origin;

  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      return null;
    }
  }

  const referer = req.headers.referer;

  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
};

export const validateOrigin = (req: Request, res: Response, next: NextFunction) => {
  if (!unsafeMethods.has(req.method)) {
    next();
    return;
  }

  const requestOrigin = resolveRequestOrigin(req);

  if (!requestOrigin || !allowedAppOriginSet.has(requestOrigin)) {
    next(new AppError('INVALID_ORIGIN', 'Origen no permitido.', 403));
    return;
  }

  next();
};
