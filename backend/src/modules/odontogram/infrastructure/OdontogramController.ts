import { Request, Response, NextFunction } from 'express';
import { OdontogramService, IOdontogramRepository } from '../application/OdontogramService';
import {
  createDentalFindingSchema,
  resolveDentalFindingSchema,
  cancelDentalFindingSchema
} from '../domain/OdontogramSchema';
import { AuthContext } from '../../../middlewares/auth';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError';
import { prisma } from '../../../infrastructure/database/prisma';

export type AuthenticatedRequest = Request & { authContext: AuthContext };

const getAuthCtx = (req: Request): AuthContext => {
  return (req as AuthenticatedRequest).authContext;
};

const odontogramService = new OdontogramService(prisma as unknown as IOdontogramRepository);

export class OdontogramController {
  static async getOdontogram(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const patientId = z.string().uuid().parse(req.params.patientId);

      const result = await odontogramService.getOdontogram(
        ctx.clinicId,
        patientId,
        ctx.membershipId
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', error.errors[0]?.message || 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async getToothDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const patientId = z.string().uuid().parse(req.params.patientId);
      const toothNumber = z.coerce.number().int().parse(req.params.toothNumber);

      const result = await odontogramService.getToothDetail(
        ctx.clinicId,
        patientId,
        toothNumber,
        ctx.membershipId
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', error.errors[0]?.message || 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async createFinding(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const patientId = z.string().uuid().parse(req.params.patientId);
      const input = createDentalFindingSchema.parse(req.body);

      const result = await odontogramService.createFinding(
        ctx.clinicId,
        patientId,
        ctx.membershipId,
        input
      );

      res.status(201).json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', error.errors[0]?.message || 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async resolveFinding(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const patientId = z.string().uuid().parse(req.params.patientId);
      const findingId = z.string().uuid().parse(req.params.findingId);
      const input = resolveDentalFindingSchema.parse(req.body);

      const result = await odontogramService.resolveFinding(
        ctx.clinicId,
        patientId,
        findingId,
        ctx.membershipId,
        input
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', error.errors[0]?.message || 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async cancelFinding(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const patientId = z.string().uuid().parse(req.params.patientId);
      const findingId = z.string().uuid().parse(req.params.findingId);
      const input = cancelDentalFindingSchema.parse(req.body);

      const result = await odontogramService.cancelFinding(
        ctx.clinicId,
        patientId,
        findingId,
        ctx.membershipId,
        input
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', error.errors[0]?.message || 'Datos inválidos', 400));
      }
      next(error);
    }
  }
}
