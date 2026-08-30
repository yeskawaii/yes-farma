import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from '../config/env';
import { allowedAppOrigins } from '../config/appOrigins';
import { authRoutes } from '../modules/identity/http/authRoutes';
import { patientRoutes } from '../modules/patients/infrastructure/patientRoutes';
import { odontogramRoutes } from '../modules/odontogram/infrastructure/odontogramRoutes';
import { appointmentRoutes } from '../modules/appointments/infrastructure/appointmentRoutes';
import { clinicalEncounterRoutes } from '../modules/clinical-encounters/infrastructure/clinicalEncounterRoutes';
import { dashboardRoutes } from '../modules/dashboard/infrastructure/dashboardRoutes';
import { patientDocumentRoutes } from '../modules/patient-documents/infrastructure/patientDocumentRoutes';
import { errorHandler } from '../shared/errors/errorHandler';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY || false);

  app.use(helmet());
  app.use(
    cors({
      origin: allowedAppOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Public Health Endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/patients', odontogramRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/clinical-encounters', clinicalEncounterRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/patient-documents', patientDocumentRoutes);

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
