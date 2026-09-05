import { Router } from 'express';
import { prisma } from '../infrastructure/database/prisma';
import { env, getWhatsAppAuthDir } from '../config/env';
import { IClock, SystemClock } from '../shared/clock/ClockPort';
import { AppointmentNotificationOutboxAdapter } from '../modules/notifications/infrastructure/AppointmentNotificationOutboxAdapter';
import { AppointmentService, IAppointmentRepository } from '../modules/appointments/application/AppointmentService';
import { AppointmentController } from '../modules/appointments/infrastructure/AppointmentController';
import { createAppointmentRoutes } from '../modules/appointments/infrastructure/appointmentRoutes';
import { PrismaNotificationJobRepository } from '../modules/notifications/infrastructure/PrismaNotificationJobRepository';
import {
  createWhatsAppRuntime,
  WhatsAppRuntime,
  WhatsAppRuntimeOptions
} from '../modules/notifications/infrastructure/baileys/createWhatsAppRuntime';
import { NotificationWorkerService } from '../modules/notifications/application/NotificationWorkerService';
import { NotificationWorkerRuntime } from '../modules/notifications/application/NotificationWorkerRuntime';
import { INotificationDeliveryPort } from '../modules/notifications/domain/NotificationDeliveryPort';

export interface CompositionRootOptions {
  workerEnabled?: boolean | undefined;
  workerPollIntervalMs?: number | undefined;
  prismaClient?: any | undefined;
  clock?: IClock | undefined;
  whatsappRuntimeFactory?: ((options: WhatsAppRuntimeOptions) => WhatsAppRuntime) | undefined;
  customDeliveryPort?: INotificationDeliveryPort | undefined;
}

export interface AppCompositionRoot {
  appointmentRoutes: Router;
  appointmentController: AppointmentController;
  appointmentService: AppointmentService;
  workerRuntime?: NotificationWorkerRuntime | undefined;
}

export const buildCompositionRoot = (options?: CompositionRootOptions): AppCompositionRoot => {
  const clock = options?.clock ?? new SystemClock();
  const db = options?.prismaClient ?? prisma;

  const notificationPort = new AppointmentNotificationOutboxAdapter(clock);
  const appointmentService = new AppointmentService(db as unknown as IAppointmentRepository, notificationPort);
  const appointmentController = new AppointmentController(appointmentService);
  const appointmentRoutes = createAppointmentRoutes(appointmentController);

  const workerEnabled = options?.workerEnabled ?? env.NOTIFICATION_WORKER_ENABLED;
  const pollIntervalMs = options?.workerPollIntervalMs ?? env.NOTIFICATION_WORKER_POLL_MS;

  let workerRuntime: NotificationWorkerRuntime;

  if (workerEnabled) {
    const factory = options?.whatsappRuntimeFactory ?? createWhatsAppRuntime;
    const authDir = getWhatsAppAuthDir();
    const whatsappRuntime = factory({ authDir });
    const jobRepo = new PrismaNotificationJobRepository(db);
    const deliveryPort = options?.customDeliveryPort ?? whatsappRuntime.delivery;
    const workerService = new NotificationWorkerService(jobRepo, deliveryPort, clock);
    workerRuntime = new NotificationWorkerRuntime(workerService, whatsappRuntime.connection, {
      enabled: true,
      pollIntervalMs
    });
  } else {
    // Disabled runtime: safe defaults, no Baileys runtime, no socket, no polling
    const dummyService = new NotificationWorkerService(
      { claimDueJobs: async () => [] } as any,
      { deliver: async () => ({ status: 'PERMANENT_FAILURE', failureCode: 'WORKER_DISABLED' }) } as any,
      clock
    );
    workerRuntime = new NotificationWorkerRuntime(dummyService, null, {
      enabled: false,
      pollIntervalMs
    });
  }

  return {
    appointmentRoutes,
    appointmentController,
    appointmentService,
    workerRuntime
  };
};
