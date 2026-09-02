import { Router } from 'express';
import { prisma } from '../infrastructure/database/prisma';
import { SystemClock } from '../shared/clock/ClockPort';
import { AppointmentNotificationOutboxAdapter } from '../modules/notifications/infrastructure/AppointmentNotificationOutboxAdapter';
import { AppointmentService, IAppointmentRepository } from '../modules/appointments/application/AppointmentService';
import { AppointmentController } from '../modules/appointments/infrastructure/AppointmentController';
import { createAppointmentRoutes } from '../modules/appointments/infrastructure/appointmentRoutes';

export interface AppCompositionRoot {
  appointmentRoutes: Router;
  appointmentController: AppointmentController;
  appointmentService: AppointmentService;
}

export const buildCompositionRoot = (): AppCompositionRoot => {
  const clock = new SystemClock();
  const notificationPort = new AppointmentNotificationOutboxAdapter(clock);
  const appointmentService = new AppointmentService(prisma as unknown as IAppointmentRepository, notificationPort);
  const appointmentController = new AppointmentController(appointmentService);
  const appointmentRoutes = createAppointmentRoutes(appointmentController);

  return {
    appointmentRoutes,
    appointmentController,
    appointmentService
  };
};
