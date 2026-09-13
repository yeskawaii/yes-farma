import type { RequestHandler } from 'express';
import { prisma } from '../infrastructure/database/prisma';
import { AppError } from '../shared/errors/AppError';
import { assertCapability, type ClinicCapability } from '../modules/clinic-configuration/capabilities';
import type { AuthContext } from './auth';

export const requireClinicCapability = (capability: ClinicCapability): RequestHandler => async (req, _res, next) => {
  try {
    const ctx = (req as typeof req & { authContext: AuthContext }).authContext;
    if (!ctx) throw new AppError('UNAUTHORIZED', 'No autenticado.', 401);
    const clinic = await prisma.clinic.findUnique({ where: { id: ctx.clinicId } });
    if (!clinic || clinic.status !== 'ACTIVE') throw new AppError('CLINIC_DISABLED', 'Clínica inactiva.', 403);
    assertCapability(clinic.clinicalSpecialty, capability);
    next();
  } catch (error) { next(error); }
};
