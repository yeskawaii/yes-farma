import { Router } from 'express';
import { authMiddleware } from '../../../middlewares/auth';
import { DashboardController } from './DashboardController';
import { DashboardService } from '../application/DashboardService';
import { prisma } from '../../../infrastructure/database/prisma';

export const dashboardRoutes = Router();

const dashboardService = new DashboardService({
  clinic: prisma.clinic,
  appointment: prisma.appointment,
  patient: prisma.patient,
  clinicalEncounter: prisma.clinicalEncounter
});

const dashboardController = new DashboardController(dashboardService);

dashboardRoutes.use(authMiddleware);

dashboardRoutes.get('/', dashboardController.getDashboard);
