import { z } from 'zod';
import type { PrismaClient, Prisma } from '../../generated/prisma';
import type { AuthContext } from '../../middlewares/auth';
import { AppError } from '../../shared/errors/AppError';

export const clinicConfigurationSchema = z.object({
  clinicalSpecialty: z.enum(['DENTISTRY', 'PEDIATRICS']),
  expectedSpecialty: z.enum(['DENTISTRY', 'PEDIATRICS']),
}).strict();
export const activeClinicSchema = z.object({ clinicId: z.string().uuid() }).strict();

export class ClinicConfigurationService {
  constructor(private readonly db: PrismaClient) {}
  private async member(tx: Prisma.TransactionClient, ctx: AuthContext, clinicId: string) {
    const member = await tx.membership.findFirst({ where: {
      userId: ctx.userId, clinicId, status: 'ACTIVE',
      clinic: { status: 'ACTIVE' }, user: { status: 'ACTIVE' },
    } });
    if (!member) throw new AppError('FORBIDDEN', 'No tienes acceso a esta clínica.', 403);
    return member;
  }
  update(ctx: AuthContext, body: unknown) {
    const input = clinicConfigurationSchema.parse(body);
    return this.db.$transaction(async tx => {
      const member = await this.member(tx, ctx, ctx.clinicId);
      if (member.id !== ctx.membershipId || member.role !== 'OWNER') throw new AppError('FORBIDDEN', 'Solo el propietario puede configurar la clínica.', 403);
      const changed = await tx.clinic.updateMany({ where: { id: ctx.clinicId, clinicalSpecialty: input.expectedSpecialty }, data: { clinicalSpecialty: input.clinicalSpecialty } });
      if (!changed.count) throw new AppError('CONCURRENCY_ERROR', 'La configuración cambió. Recarga antes de guardar.', 409);
      if (input.expectedSpecialty !== input.clinicalSpecialty) await tx.auditEvent.create({ data: {
        clinicId: ctx.clinicId, actorUserId: ctx.userId, action: 'CLINIC_SPECIALTY_UPDATED', entityType: 'Clinic', entityId: ctx.clinicId,
        metadata: { before: input.expectedSpecialty, after: input.clinicalSpecialty },
      } });
      return { clinicalSpecialty: input.clinicalSpecialty };
    }, { isolationLevel: 'Serializable' });
  }
  switchClinic(ctx: AuthContext, body: unknown) {
    const { clinicId } = activeClinicSchema.parse(body);
    return this.db.$transaction(async tx => {
      await this.member(tx, ctx, clinicId);
      const changed = await tx.session.updateMany({ where: { id: ctx.sessionId, userId: ctx.userId, revokedAt: null, expiresAt: { gt: new Date() } }, data: { activeClinicId: clinicId } });
      if (!changed.count) throw new AppError('UNAUTHORIZED', 'Sesión inválida.', 401);
      return { activeClinicId: clinicId };
    }, { isolationLevel: 'Serializable' });
  }
}
