import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../../generated/prisma';
import { AuthContext } from '../../middlewares/auth';
import { AppError } from '../../shared/errors/AppError';
import { draftSchema, versionSchema, cancelSchema, profileSchema, completeItems } from './PrescriptionSchema';
type Tx = Prisma.TransactionClient;
const include = { items: { orderBy: { sortOrder: 'asc' as const } }, prescriber: { select: { user: { select: { firstName: true, lastName: true } } } } };
export class PrescriptionService {
  constructor(private db: PrismaClient) {}
  private async transaction<T>(fn: (tx: Tx) => Promise<T>) {
    for (let attempt = 0; ; attempt++) {
      try { return await this.db.$transaction(fn, { isolationLevel: 'Serializable' }); }
      catch (e) {
        // Prisma's PostgreSQL adapter can expose serialization failures at commit
        // as DriverAdapterError rather than Prisma's usual P2034.
        const cause = e && typeof e === 'object' && 'cause' in e ? e.cause as { originalCode?: string; kind?: string } : undefined;
        const conflict = (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') || cause?.originalCode === '40001' || cause?.kind === 'TransactionWriteConflict';
        if (conflict && attempt < 2) continue;
        if (conflict || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw new AppError('CONCURRENCY_ERROR', 'El registro cambió. Recarga e intenta nuevamente.', 409);
        throw e;
      }
    }
  }

  private async access(tx: Tx, ctx: AuthContext) {
    const member = await tx.membership.findFirst({ where: { id: ctx.membershipId, userId: ctx.userId, clinicId: ctx.clinicId, status: 'ACTIVE', role: { in: ['OWNER', 'PROFESSIONAL'] }, user: { status: 'ACTIVE' }, clinic: { status: 'ACTIVE' } }, include: { profile: true, user: true, clinic: true } });
    if (!member) throw new AppError('FORBIDDEN', 'No tienes permisos para consultar o prescribir en el expediente clínico.', 403);
    return member;
  }
  private async patient(tx: Tx, ctx: AuthContext, patientId: string, write = false) {
    const p = await tx.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId } });
    if (!p) throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
    if (write && p.status !== 'ACTIVE') throw new AppError('PATIENT_INACTIVE', 'El paciente está inactivo.', 409);
    return p;
  }
  private audit(tx: Tx, ctx: AuthContext, action: string, id: string, metadata: Prisma.InputJsonValue, entityType = 'Prescription') {
    return tx.auditEvent.create({ data: { clinicId: ctx.clinicId, actorUserId: ctx.userId, action, entityType, entityId: id, metadata } });
  }
  profile(ctx: AuthContext) { return this.transaction(async tx => { const m = await this.access(tx, ctx); return { profile: m.profile, name: `${m.user.firstName} ${m.user.lastName}`, clinic: m.clinic.name }; }); }
  saveProfile(ctx: AuthContext, body: unknown) {
    const data = profileSchema.parse(body);
    return this.transaction(async tx => {
      const m = await this.access(tx, ctx);
      if (m.profile && !m.profile.active) throw new AppError('FORBIDDEN', 'El perfil profesional está inactivo.', 403);
      const profile = await tx.professionalProfile.upsert({ where: { membershipId: m.id }, create: { membershipId: m.id, ...data }, update: data });
      await this.audit(tx, ctx, 'PRESCRIBER_PROFILE_UPDATED', profile.id, { membershipId: m.id }, 'ProfessionalProfile');
      return profile;
    });
  }
  list(ctx: AuthContext, patientId: string) { return this.transaction(async tx => { await this.access(tx, ctx); await this.patient(tx, ctx, patientId); return tx.prescription.findMany({ where: { clinicId: ctx.clinicId, patientId }, include, orderBy: { createdAt: 'desc' } }); }); }
  get(ctx: AuthContext, patientId: string, id: string) { return this.transaction(async tx => { await this.access(tx, ctx); return this.find(tx, ctx, patientId, id); }); }
  private async find(tx: Tx, ctx: AuthContext, patientId: string, id: string) {
    const p = await tx.prescription.findFirst({ where: { id, clinicId: ctx.clinicId, patientId }, include });
    if (!p) throw new AppError('NOT_FOUND', 'Receta no encontrada.', 404);
    return p;
  }
  private owns(ctx: AuthContext, p: { prescriberMembershipId: string }) { if (p.prescriberMembershipId !== ctx.membershipId) throw new AppError('FORBIDDEN', 'Solo el prescriptor puede modificar, emitir o anular esta receta.', 403); }
  save(ctx: AuthContext, patientId: string, body: unknown, id?: string) {
    const input = draftSchema.parse(body);
    if (id) versionSchema.parse({ expectedVersion: input.expectedVersion });
    return this.transaction(async tx => {
      await this.access(tx, ctx); await this.patient(tx, ctx, patientId, true);
      if (input.encounterId && !await tx.clinicalEncounter.findFirst({ where: { id: input.encounterId, clinicId: ctx.clinicId, patientId } })) throw new AppError('INVALID_ENCOUNTER', 'La consulta no pertenece a este paciente.', 400);
      let savedId = id;
      const data = { generalInstructions: input.generalInstructions, encounterId: input.encounterId ?? null };
      if (id) {
        const p = await this.find(tx, ctx, patientId, id); this.owns(ctx, p);
        const changed = await tx.prescription.updateMany({ where: { id, clinicId: ctx.clinicId, status: 'DRAFT', version: input.expectedVersion! }, data: { ...data, version: { increment: 1 } } });
        if (!changed.count) throw new AppError('CONFLICT', 'La receta cambió o ya no es un borrador. Recarga.', 409);
        await tx.prescriptionItem.deleteMany({ where: { clinicId: ctx.clinicId, prescriptionId: id } });
      } else {
        const p = await tx.prescription.create({ data: { ...data, clinicId: ctx.clinicId, patientId, prescriberMembershipId: ctx.membershipId } }); savedId = p.id;
      }
      await tx.prescriptionItem.createMany({ data: input.items.map((i, sortOrder) => ({ ...i, sortOrder, prescriptionId: savedId!, clinicId: ctx.clinicId })) });
      const result = await this.find(tx, ctx, patientId, savedId!);
      await this.audit(tx, ctx, result.version === 1 ? 'PRESCRIPTION_CREATED' : 'PRESCRIPTION_DRAFT_UPDATED', savedId!, { version: result.version, patientId, itemCount: result.items.length });
      return result;
    });
  }
  issue(ctx: AuthContext, patientId: string, id: string, body: unknown) {
    const { expectedVersion } = versionSchema.parse(body);
    return this.transaction(async tx => {
      const m = await this.access(tx, ctx); const patient = await this.patient(tx, ctx, patientId, true);
      const p = await this.find(tx, ctx, patientId, id); this.owns(ctx, p);
      if (p.status !== 'DRAFT' || p.version !== expectedVersion) throw new AppError('CONFLICT', 'La receta cambió o ya fue emitida. Recarga.', 409);
      const profile = m.profile;
      if (!profile?.active || !profile.professionalLicense?.trim() || !profile.professionalAddress?.trim() || !m.user.firstName.trim() || !m.user.lastName.trim()) throw new AppError('PROFILE_INCOMPLETE', 'Completa tus datos profesionales antes de emitir una receta.', 400);
      if (!patient.birthDate) throw new AppError('PATIENT_INCOMPLETE', 'Completa la fecha de nacimiento del paciente antes de emitir.', 400);
      if (!completeItems(p.items)) throw new AppError('INCOMPLETE_ITEMS', 'Completa medicamento, concentración, presentación, dosis, vía, frecuencia, duración y cantidad de cada medicamento.', 400);
      const folio = `RX-${randomUUID().replace(/-/g, '').toUpperCase()}`;
      const issuedAt = new Date();
      const snapshot = { clinic: { name: m.clinic.name, timeZone: m.clinic.timeZone }, patient: { name: [patient.firstName, patient.lastName, patient.secondLastName].filter(Boolean).join(' '), birthDate: patient.birthDate.toISOString().slice(0,10) }, professional: { name: `${m.user.firstName} ${m.user.lastName}`, license: profile.professionalLicense, specialty: profile.specialtyCode, specialtyLicense: profile.specialtyLicense, address: profile.professionalAddress, phone: profile.professionalPhone }, items: p.items.map(({ id, clinicId, prescriptionId, ...i }) => i), generalInstructions: p.generalInstructions, folio, issuedAt: issuedAt.toISOString() };
      const changed = await tx.prescription.updateMany({ where: { id, clinicId: ctx.clinicId, status: 'DRAFT', version: expectedVersion }, data: { status: 'ISSUED', folio, issuedAt, snapshot, version: { increment: 1 } } });
      if (!changed.count) throw new AppError('CONFLICT', 'La receta cambió. Recarga.', 409);
      await this.audit(tx, ctx, 'PRESCRIPTION_ISSUED', id, { folio, patientId, version: expectedVersion + 1 });
      return this.find(tx, ctx, patientId, id);
    });
  }
  cancel(ctx: AuthContext, patientId: string, id: string, body: unknown) {
    const { expectedVersion, reason } = cancelSchema.parse(body);
    return this.transaction(async tx => {
      await this.access(tx, ctx); const p = await this.find(tx, ctx, patientId, id); this.owns(ctx, p);
      const changed = await tx.prescription.updateMany({ where: { id, clinicId: ctx.clinicId, status: 'ISSUED', version: expectedVersion }, data: { status: 'CANCELLED', cancellationReason: reason, cancelledAt: new Date(), cancelledByMembershipId: ctx.membershipId, version: { increment: 1 } } });
      if (!changed.count) throw new AppError('CONFLICT', 'Solo se puede anular una receta emitida vigente. Recarga.', 409);
      await this.audit(tx, ctx, 'PRESCRIPTION_CANCELLED', id, { folio: p.folio, reason });
      return this.find(tx, ctx, patientId, id);
    });
  }
}
