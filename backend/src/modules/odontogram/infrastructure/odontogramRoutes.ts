import { requireClinicCapability } from '../../../middlewares/clinicCapability';
import { Router } from 'express';
import { OdontogramController } from './OdontogramController';
import { authMiddleware } from '../../../middlewares/auth';
import { validateOrigin } from '../../../middlewares/validateOrigin';

const router = Router();

router.use(authMiddleware);
router.use(validateOrigin);
// Scope the guard: this router is mounted alongside shared patient modules.
router.use('/:patientId/odontogram', requireClinicCapability('odontogram'));

router.get('/:patientId/odontogram', OdontogramController.getOdontogram);
router.get('/:patientId/odontogram/teeth/:toothNumber', OdontogramController.getToothDetail);
router.post('/:patientId/odontogram/findings', OdontogramController.createFinding);
router.post('/:patientId/odontogram/batch', OdontogramController.applyBatch);
router.post('/:patientId/odontogram/findings/:findingId/resolve', OdontogramController.resolveFinding);
router.post('/:patientId/odontogram/findings/:findingId/cancel', OdontogramController.cancelFinding);

export { router as odontogramRoutes };
