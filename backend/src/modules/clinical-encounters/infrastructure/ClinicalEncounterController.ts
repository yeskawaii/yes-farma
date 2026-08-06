import { Request, Response, NextFunction } from 'express';
import { ClinicalEncounterService, IClinicalEncounterRepository } from '../application/ClinicalEncounterService';
import {
  createClinicalEncounterSchema,
  listClinicalEncountersSchema
} from '../domain/ClinicalEncounterSchema';
import { AuthContext } from '../../../middlewares/auth';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError';
import { prisma } from '../../../infrastructure/database/prisma';

export type AuthenticatedRequest = Request & { authContext: AuthContext };

const getAuthCtx = (req: Request): AuthContext => {
  return (req as AuthenticatedRequest).authContext;
};

// Use the singleton Prisma instance safely typed
const clinicalEncounterService = new ClinicalEncounterService(prisma as unknown as IClinicalEncounterRepository);

export class ClinicalEncounterController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const input = createClinicalEncounterSchema.parse(req.body);

      const result = await clinicalEncounterService.createEncounter(
        ctx.clinicId,
        ctx.membershipId,
        ctx.userId,
        ctx.role,
        input
      );

      res.status(201).json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const input = listClinicalEncountersSchema.parse(req.query);

      const result = await clinicalEncounterService.listEncounters(ctx.clinicId, ctx.role, input);
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);

      const result = await clinicalEncounterService.getEncounterById(ctx.clinicId, id, ctx.role);
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'ID inválido', 400));
      }
      next(error);
    }
  }
}
