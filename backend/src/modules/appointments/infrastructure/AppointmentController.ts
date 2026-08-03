import { Request, Response, NextFunction } from 'express';
import { AppointmentService } from '../application/AppointmentService';
import { createAppointmentSchema, listAppointmentsSchema } from '../domain/AppointmentSchema';
import { AuthContext } from '../../../middlewares/auth';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError';
import { prisma } from '../../../infrastructure/database/prisma';

export type AuthenticatedRequest = Request & { authContext: AuthContext };

const getAuthCtx = (req: Request): AuthContext => {
  return (req as AuthenticatedRequest).authContext;
};

const appointmentService = new AppointmentService(prisma as any);

export class AppointmentController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const input = listAppointmentsSchema.parse(req.query);
      const result = await appointmentService.listAppointments(ctx.clinicId, input);
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
      const input = createAppointmentSchema.parse(req.body);

      const appointment = await appointmentService.createAppointment(
        ctx.clinicId,
        ctx.membershipId,
        ctx.userId,
        input,
        ctx.role
      );

      res.status(201).json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'Datos inválidos', 400));
      }
      next(error);
    }
  }
}
