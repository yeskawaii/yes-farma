import { Router } from 'express';
import { AppointmentController } from './AppointmentController';
import { authMiddleware } from '../../../middlewares/auth';

const router = Router();

router.use(authMiddleware);

// Todos los roles activos en la clínica pueden consultar
router.get('/', AppointmentController.list);

// Todos los roles activos pueden crear, el Service aplica las restricciones granulares
router.post('/', AppointmentController.create);

export { router as appointmentRoutes };
