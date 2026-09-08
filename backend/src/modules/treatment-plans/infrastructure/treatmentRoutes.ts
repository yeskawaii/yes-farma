import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthContext } from '../../../middlewares/auth';
import { validateOrigin } from '../../../middlewares/validateOrigin';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../../shared/errors/AppError';
import { TreatmentService } from '../application/TreatmentService';

export function createTreatmentRoutes(service = new TreatmentService(prisma)) {
  const router = Router();
  router.use(['/dental-procedures', '/patients/:patientId/treatment-plan', '/patients/:patientId/treatments', '/patients/:patientId/budgets'], authMiddleware, validateOrigin);
  router.use('/patients/:patientId/budgets', (_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  const route = (fn: (ctx: AuthContext, req: Request) => Promise<unknown>, status = 200) => async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(status).json(await fn((req as Request & { authContext: AuthContext }).authContext, req)); }
    catch (e) { next(e instanceof z.ZodError ? new AppError('VALIDATION_ERROR', e.errors[0]?.message || 'Datos inválidos', 400) : e); }
  };
  const param = (req: Request, key: string) => z.string().uuid().parse(req.params[key]);
  router.get('/dental-procedures', route(ctx => service.listCatalog(ctx)));
  router.post('/dental-procedures', route((ctx, req) => service.saveProcedure(ctx, req.body), 201));
  router.patch('/dental-procedures/:id', route((ctx, req) => service.saveProcedure(ctx, req.body, param(req, 'id'))));
  router.get('/patients/:patientId/treatment-plan', route((ctx, req) => service.list(ctx, param(req, 'patientId'))));
  router.post('/patients/:patientId/treatments', route((ctx, req) => service.saveTreatment(ctx, param(req, 'patientId'), req.body), 201));
  router.patch('/patients/:patientId/treatments/:id', route((ctx, req) => service.saveTreatment(ctx, param(req, 'patientId'), req.body, param(req, 'id'))));
  router.post('/patients/:patientId/budgets', route((ctx, req) => service.createBudget(ctx, param(req, 'patientId'), req.body), 201));
  router.patch('/patients/:patientId/budgets/:id', route((ctx, req) => service.updateBudget(ctx, param(req, 'patientId'), param(req, 'id'), req.body)));
  router.get('/patients/:patientId/budgets/:id/payments', route((ctx, req) => service.paymentHistory(ctx, param(req, 'patientId'), param(req, 'id'))));
  router.post('/patients/:patientId/budgets/:id/payments', route((ctx, req) => service.createPayment(ctx, param(req, 'patientId'), param(req, 'id'), req.body), 201));
  router.post('/patients/:patientId/budgets/:id/payments/:paymentId/cancel', route((ctx, req) => service.cancelPayment(ctx, param(req, 'patientId'), param(req, 'id'), param(req, 'paymentId'), req.body)));
  router.get('/patients/:patientId/budgets/:id/print', route((ctx, req) => service.printBudget(ctx, param(req, 'patientId'), param(req, 'id'))));
  return router;
}
