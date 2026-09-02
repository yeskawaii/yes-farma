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

export type AuthenticatedRequest = Request & { authContext: AuthContext };

const getAuthCtx = (req: Request): AuthContext => {
  return (req as AuthenticatedRequest).authContext;
};

export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getAuthCtx(req);
      const input = listAppointmentsSchema.parse(req.query);
      const result = await this.appointmentService.listAppointments(ctx.clinicId, input);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'Datos inválidos', 400));
      }
      next(error);
    }
  };

  listProfessionals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getAuthCtx(req);
      const result = await this.appointmentService.listProfessionals(ctx.clinicId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      const appointment = await this.appointmentService.getAppointmentById(ctx.clinicId, id);
      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', 'ID inválido', 400));
      }
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getAuthCtx(req);
      const input = createAppointmentSchema.parse(req.body);

      const appointment = await this.appointmentService.createAppointment(
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
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      const input = updateAppointmentSchema.parse(req.body);

      const appointment = await this.appointmentService.updateAppointment(
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
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      const input = updateAppointmentStatusSchema.parse(req.body);

      const appointment = await this.appointmentService.updateAppointmentStatus(
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
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = getAuthCtx(req);
      const id = z.string().uuid().parse(req.params.id);
      const input = cancelAppointmentSchema.parse(req.body);

      const appointment = await this.appointmentService.cancelAppointment(
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
  };
}
