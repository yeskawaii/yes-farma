import { Router } from 'express';
import { ClinicalEncounterController } from './ClinicalEncounterController';
import { authMiddleware } from '../../../middlewares/auth';

const router = Router();

router.use(authMiddleware);

router.post('/', ClinicalEncounterController.create);
router.get('/', ClinicalEncounterController.list);
router.get('/:id', ClinicalEncounterController.getById);
router.patch('/:id', ClinicalEncounterController.update);
router.post('/:id/finalize', ClinicalEncounterController.finalize);

export { router as clinicalEncounterRoutes };
