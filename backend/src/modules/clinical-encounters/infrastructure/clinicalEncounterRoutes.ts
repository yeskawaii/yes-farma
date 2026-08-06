import { Router } from 'express';
import { ClinicalEncounterController } from './ClinicalEncounterController';
import { authMiddleware } from '../../../middlewares/auth';

const router = Router();

router.use(authMiddleware);

router.post('/', ClinicalEncounterController.create);
router.get('/', ClinicalEncounterController.list);
router.get('/:id', ClinicalEncounterController.getById);

export { router as clinicalEncounterRoutes };
