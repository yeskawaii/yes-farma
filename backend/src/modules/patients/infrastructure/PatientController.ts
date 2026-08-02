import { Request, Response, NextFunction } from 'express';
import { PatientService } from '../application/PatientService';
import { createPatientSchema, listPatientsSchema, updatePatientSchema } from '../domain/PatientSchema';
import { AuthContext } from '../../../middlewares/auth';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError';
import { prisma } from '../../../infrastructure/database/prisma';

export type AuthenticatedRequest = Request & { authContext: AuthContext };

// helper to get typed context
const getAuthCtx = (req: Request): AuthContext => {
  return (req as AuthenticatedRequest).authContext;
};

// Singleton service instance with real prisma for production
const patientService = new PatientService(prisma);

export class PatientController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const input = listPatientsSchema.parse(req.query);
      const result = await patientService.listPatients(ctx.clinicId, input);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const input = createPatientSchema.parse(req.body);
      const patient = await patientService.createPatient(
        ctx.clinicId,
        ctx.membershipId,
        ctx.userId,
        input
      );
      res.status(201).json(patient);
    } catch (error) {
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
      const patient = await patientService.getPatientById(ctx.clinicId, id);
      res.json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'ID inválido', 400));
      }
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      const input = updatePatientSchema.parse(req.body);
      
      const patient = await patientService.updatePatient(
        ctx.clinicId,
        id,
        ctx.membershipId,
        ctx.userId,
        input
      );
      res.json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      
      const patient = await patientService.deactivatePatient(
        ctx.clinicId,
        id,
        ctx.membershipId,
        ctx.userId
      );
      res.json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'ID inválido', 400));
      }
      next(error);
    }
  }
}
