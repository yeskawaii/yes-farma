import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthContext } from '../../../middlewares/auth';
import { validateOrigin } from '../../../middlewares/validateOrigin';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../../shared/errors/AppError';
import { InventoryService } from '../application/InventoryService';
export function createInventoryRoutes(service = new InventoryService(prisma)) {
  const router = Router();
  router.use(authMiddleware, validateOrigin, (_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  const route = (fn: (ctx: AuthContext, req: Request) => Promise<unknown>, status = 200) => async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(status).json(await fn((req as Request & { authContext: AuthContext }).authContext, req)); }
    catch (e) { next(e instanceof z.ZodError ? new AppError('VALIDATION_ERROR', e.errors[0]?.message || 'Datos inválidos', 400) : e); }
  };
  const id = (req: Request) => z.string().uuid().parse(req.params.id);
  router.get('/', route(ctx => service.list(ctx)));
  router.post('/products', route((ctx, req) => service.saveProduct(ctx, req.body), 201));
  router.get('/products/:id', route((ctx, req) => service.detail(ctx, id(req))));
  router.patch('/products/:id', route((ctx, req) => service.saveProduct(ctx, req.body, id(req))));
  router.post('/products/:id/movements', route((ctx, req) => service.move(ctx, id(req), req.body), 201));
  router.post('/suppliers', route((ctx, req) => service.saveSupplier(ctx, req.body), 201));
  router.patch('/suppliers/:id', route((ctx, req) => service.saveSupplier(ctx, req.body, id(req))));
  return router;
}
