import { Router } from 'express';
import { PatientController } from './PatientController';
import { requireRoles } from './requireRoles';
import { authMiddleware } from '../../../middlewares/auth';
import { validateOrigin } from '../../../middlewares/validateOrigin';

export const patientRoutes = Router();

patientRoutes.use(authMiddleware);
patientRoutes.use(validateOrigin);

patientRoutes.get('/', PatientController.list);

patientRoutes.post(
  '/',
  requireRoles(['OWNER', 'PROFESSIONAL', 'ASSISTANT']),
  PatientController.create
);

patientRoutes.get('/:id', PatientController.getById);

patientRoutes.patch(
  '/:id',
  requireRoles(['OWNER', 'PROFESSIONAL', 'ASSISTANT']),
  PatientController.update
);

patientRoutes.patch(
  '/:id/deactivate',
  requireRoles(['OWNER', 'PROFESSIONAL']),
  PatientController.deactivate
);

patientRoutes.patch(
  '/:id/reactivate',
  requireRoles(['OWNER', 'PROFESSIONAL']),
  PatientController.reactivate
);
