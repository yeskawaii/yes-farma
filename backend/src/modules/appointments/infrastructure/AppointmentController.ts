import { Request, Response, NextFunction } from 'express';
import { AppointmentService } from '../application/AppointmentService';
import {
  createAppointmentSchema,
  listAppointmentsSchema,
  updateAppointmentSchema,
  updateAppointmentStatusSchema,
  cancelAppointmentSchema
} from '../domain/AppointmentSchema';
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

  static async listProfessionals(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const result = await appointmentService.listProfessionals(ctx.clinicId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      const appointment = await appointmentService.getAppointmentById(ctx.clinicId, id);
      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'ID inválido', 400));
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

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      const input = updateAppointmentSchema.parse(req.body);

      const appointment = await appointmentService.updateAppointment(
        ctx.clinicId,
        id,
        ctx.membershipId,
        ctx.userId,
        ctx.role,
        input
      );

      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      const input = updateAppointmentStatusSchema.parse(req.body);

      const appointment = await appointmentService.updateAppointmentStatus(
        ctx.clinicId,
        id,
        ctx.membershipId,
        ctx.userId,
        ctx.role,
        input
      );

      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'Datos inválidos', 400));
      }
      next(error);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      const input = cancelAppointmentSchema.parse(req.body);

      const appointment = await appointmentService.cancelAppointment(
        ctx.clinicId,
        id,
        ctx.membershipId,
        ctx.userId,
        ctx.role,
        input
      );

      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'Datos inválidos', 400));
      }
      next(error);
    }
  }
}
