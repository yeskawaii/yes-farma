import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthContext } from '../../middlewares/auth';
import { validateOrigin } from '../../middlewares/validateOrigin';
import { prisma } from '../../infrastructure/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { PrescriptionService } from './PrescriptionService';
export function createPrescriptionRoutes(service = new PrescriptionService(prisma)) {
  const router = Router();
  router.use(authMiddleware, validateOrigin);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  const route = (fn: (ctx: AuthContext, req: Request) => Promise<unknown>, status = 200) => async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(status).json(await fn((req as Request & { authContext: AuthContext }).authContext, req)); }
    catch (e) { next(e instanceof z.ZodError ? new AppError('VALIDATION_ERROR', 'Datos inválidos: ' + e.errors.map(i => `${i.path.join('.')}: ${i.message}`).join('; '), 400) : e); }
  };
  const param = (req: Request, key: string) => z.string().uuid().parse(req.params[key]);
  router.get('/profile', route(ctx => service.profile(ctx)));
  router.patch('/profile', route((ctx, req) => service.saveProfile(ctx, req.body)));
  router.get('/patients/:patientId', route((ctx, req) => service.list(ctx, param(req, 'patientId'))));
  router.post('/patients/:patientId', route((ctx, req) => service.save(ctx, param(req, 'patientId'), req.body), 201));
  router.get('/patients/:patientId/:id', route((ctx, req) => service.get(ctx, param(req, 'patientId'), param(req, 'id'))));
  router.patch('/patients/:patientId/:id', route((ctx, req) => service.save(ctx, param(req, 'patientId'), req.body, param(req, 'id'))));
  router.post('/patients/:patientId/:id/issue', route((ctx, req) => service.issue(ctx, param(req, 'patientId'), param(req, 'id'), req.body)));
  router.post('/patients/:patientId/:id/cancel', route((ctx, req) => service.cancel(ctx, param(req, 'patientId'), param(req, 'id'), req.body)));
  return router;
}
