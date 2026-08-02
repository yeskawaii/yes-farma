import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from '../config/env';
import { authRoutes } from '../modules/identity/http/authRoutes';
import { patientRoutes } from '../modules/patients/infrastructure/patientRoutes';
import { errorHandler } from '../shared/errors/errorHandler';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true');

  app.use(helmet());
  app.use(
    cors({
      origin: env.APP_ORIGIN,
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

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
