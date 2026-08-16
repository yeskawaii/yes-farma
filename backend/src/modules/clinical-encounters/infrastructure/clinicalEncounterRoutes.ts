import { Router } from 'express';
import { ClinicalEncounterController } from './ClinicalEncounterController';
import { authMiddleware } from '../../../middlewares/auth';
import { validateOrigin } from '../../../middlewares/validateOrigin';

const router = Router();

router.use(authMiddleware);
router.use(validateOrigin);

router.post('/', ClinicalEncounterController.create);
router.get('/', ClinicalEncounterController.list);
router.get('/records', ClinicalEncounterController.listRecords);
router.get('/:id', ClinicalEncounterController.getById);
router.patch('/:id', ClinicalEncounterController.update);
router.post('/:id/finalize', ClinicalEncounterController.finalize);
router.post('/:id/amendments', ClinicalEncounterController.addAmendment);

export { router as clinicalEncounterRoutes };
