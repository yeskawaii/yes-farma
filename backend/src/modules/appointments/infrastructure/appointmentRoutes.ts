import { Router } from 'express';
import { AppointmentController } from './AppointmentController';
import { authMiddleware } from '../../../middlewares/auth';
import { validateOrigin } from '../../../middlewares/validateOrigin';

export const createAppointmentRoutes = (controller: AppointmentController): Router => {
  const router = Router();

  router.use(authMiddleware);
  router.use(validateOrigin);

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/professionals', controller.listProfessionals);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);
  router.patch('/:id/status', controller.updateStatus);
  router.patch('/:id/cancel', controller.cancel);

  return router;
};
