import { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {})
      },
    });
    return;
  }

  console.error('[Unhandled Error]:', err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ocurrió un error inesperado.',
    },
  });
};
