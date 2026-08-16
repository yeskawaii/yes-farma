import { Router } from 'express';
import { AppointmentController } from './AppointmentController';
import { authMiddleware } from '../../../middlewares/auth';
import { validateOrigin } from '../../../middlewares/validateOrigin';

const router = Router();

router.use(authMiddleware);
router.use(validateOrigin);

// Listar citas
router.get('/', AppointmentController.list);

// Crear cita
router.post('/', AppointmentController.create);

// Listar profesionales asignables
router.get('/professionals', AppointmentController.listProfessionals);

// Detalle de cita
router.get('/:id', AppointmentController.getById);

// Editar cita (reprogramar/notas)
router.patch('/:id', AppointmentController.update);

// Cambiar estado (IN_PROGRESS, COMPLETED, NO_SHOW, CONFIRMED)
router.patch('/:id/status', AppointmentController.updateStatus);

// Cancelar cita
router.patch('/:id/cancel', AppointmentController.cancel);

export { router as appointmentRoutes };
