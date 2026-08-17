import { Router } from 'express';
import { PatientDocumentController } from './PatientDocumentController';
import { requireRoles } from '../../patients/infrastructure/requireRoles';
import { authMiddleware } from '../../../middlewares/auth';
import { validateOrigin } from '../../../middlewares/validateOrigin';

export const patientDocumentRoutes = Router();

patientDocumentRoutes.use(authMiddleware);

patientDocumentRoutes.get(
  '/',
  requireRoles(['OWNER', 'PROFESSIONAL']),
  PatientDocumentController.listDocuments
);

patientDocumentRoutes.get(
  '/:id/download',
  requireRoles(['OWNER', 'PROFESSIONAL']),
  PatientDocumentController.getDownloadUrl
);

patientDocumentRoutes.get(
  '/:id/preview',
  requireRoles(['OWNER', 'PROFESSIONAL']),
  PatientDocumentController.getPreviewUrl
);

// validateOrigin para mutaciones
patientDocumentRoutes.post(
  '/uploads',
  validateOrigin,
  requireRoles(['OWNER', 'PROFESSIONAL']),
  PatientDocumentController.createUploadUrl
);

patientDocumentRoutes.post(
  '/:id/complete',
  validateOrigin,
  requireRoles(['OWNER', 'PROFESSIONAL']),
  PatientDocumentController.completeUpload
);

patientDocumentRoutes.delete(
  '/:id',
  validateOrigin,
  requireRoles(['OWNER', 'PROFESSIONAL']),
  PatientDocumentController.deleteDocument
);
