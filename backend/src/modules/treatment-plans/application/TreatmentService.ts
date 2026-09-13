import { assertCapability, capabilitiesFor } from '../../clinic-configuration/capabilities';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../../../generated/prisma';
import { AuthContext } from '../../../middlewares/auth';
import { AppError } from '../../../shared/errors/AppError';
import { procedureSchema, procedureUpdateSchema, treatmentSchema, treatmentUpdateSchema, budgetSchema, budgetUpdateSchema, paymentSchema, paymentCancellationSchema, budgetFinances, cents, money, treatmentTotals } from '../domain/TreatmentSchema';

type Tx = Prisma.TransactionClient;
export class TreatmentService {
  constructor(private readonly db: PrismaClient) {}

  private async access(tx: Tx, ctx: AuthContext, patientId?: string, write = false) {
    const member = await tx.membership.findFirst({ where: { id: ctx.membershipId, clinicId: ctx.clinicId, status: 'ACTIVE', role: { in: ['OWNER', 'PROFESSIONAL'] }, profile: { active: true } } });
    if (!member) throw new AppError('FORBIDDEN', 'Se requiere un perfil profesional activo.', 403);
    if (patientId) {
      const patient = await tx.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId } });
      if (!patient) throw new AppError('NOT_FOUND', 'Paciente no encontrado.', 404);
      if (write && patient.status !== 'ACTIVE') throw new AppError('PATIENT_INACTIVE', 'El paciente está inactivo.', 409);
    }
  }
  private audit(tx: Tx, ctx: AuthContext, action: string, entityId: string, metadata: Prisma.InputJsonValue) {
    return tx.auditEvent.create({ data: { clinicId: ctx.clinicId, actorUserId: ctx.userId, action, entityType: 'TreatmentPlan', entityId, metadata } });
  }
  private async transaction<T>(fn: (tx: Tx) => Promise<T>) {
    try { return await this.db.$transaction(fn, { isolationLevel: 'Serializable' }); }
    catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') throw new AppError('CONCURRENCY_ERROR', 'El registro cambió. Recarga e intenta nuevamente.', 409);
      throw e;
    }
  }
  listCatalog(ctx: AuthContext) {
    return this.transaction(async tx => { await this.access(tx, ctx); return tx.dentalProcedure.findMany({ where: { clinicId: ctx.clinicId }, orderBy: { name: 'asc' } }); });
  }
  saveProcedure(ctx: AuthContext, body: unknown, id?: string) {
    const parsed = id ? procedureUpdateSchema.parse(body) : procedureSchema.parse(body);
    const { name, description, defaultPrice, active } = parsed;
    const data = { name, description, defaultPrice, active };
    return this.transaction(async tx => {
      await this.access(tx, ctx);
      if (id) {
        const result = await tx.dentalProcedure.updateMany({ where: { id, clinicId: ctx.clinicId, version: procedureUpdateSchema.parse(body).expectedVersion }, data: { ...data, version: { increment: 1 } } });
        if (!result.count) throw new AppError('CONCURRENCY_ERROR', 'Procedimiento no disponible o modificado. Recarga.', 409);
      }
      const item = id ? await tx.dentalProcedure.findUniqueOrThrow({ where: { id } }) : await tx.dentalProcedure.create({ data: { ...data, clinicId: ctx.clinicId } });
      await this.audit(tx, ctx, id ? 'PROCEDURE_UPDATED' : 'PROCEDURE_CREATED', item.id, { name, defaultPrice, active });
      return item;
    });
  }
  list(ctx: AuthContext, patientId: string) {
    return this.transaction(async tx => {
      await this.access(tx, ctx, patientId);
      const treatments = await tx.patientTreatment.findMany({ where: { clinicId: ctx.clinicId, patientId }, orderBy: { createdAt: 'desc' }, include: { professional: { select: { user: { select: { firstName: true, lastName: true } } } } } });
      const budgets = await tx.treatmentBudget.findMany({ where: { clinicId: ctx.clinicId, patientId }, include: { items: true, payments: true }, orderBy: { createdAt: 'desc' } });
      return { treatments, totals: treatmentTotals(treatments), budgets: budgets.map(({ payments, ...b }) => ({ ...b, ...budgetFinances(b.total, payments) })) };
    });
  }
  saveTreatment(ctx: AuthContext, patientId: string, body: unknown, id?: string) {
    const input = id ? treatmentUpdateSchema.parse(body) : treatmentSchema.parse(body);
    return this.transaction(async tx => {
      await this.access(tx, ctx, patientId, true);
      const previous = id ? await tx.patientTreatment.findFirst({ where: { id, clinicId: ctx.clinicId, patientId } }) : null;
      if (id && !previous) throw new AppError('NOT_FOUND', 'Tratamiento no encontrado.', 404);
      // Historical dental associations survive a clinic specialty change; only a
      // dental clinic can create, clear or alter those associations.
      if (input.toothNumber !== (previous?.toothNumber ?? null) ||
          JSON.stringify([...input.surfaces].sort()) !== JSON.stringify([...(previous?.surfaces ?? [])].sort())) {
        const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: ctx.clinicId } });
        assertCapability(clinic.clinicalSpecialty, 'dentalClinicalTools');
      }
      if (input.procedureId && input.procedureId !== previous?.procedureId) {
        if (!await tx.dentalProcedure.findFirst({ where: { id: input.procedureId, clinicId: ctx.clinicId, active: true } })) throw new AppError('VALIDATION_ERROR', 'Procedimiento inactivo o inexistente.', 400);
      }
      if (input.professionalMembershipId && !await tx.membership.findFirst({ where: { id: input.professionalMembershipId, clinicId: ctx.clinicId, status: 'ACTIVE', role: { in: ['OWNER', 'PROFESSIONAL'] }, profile: { active: true } } })) throw new AppError('INVALID_PROFESSIONAL', 'Profesional no disponible.', 400);
      const { name, description, procedureId, toothNumber, surfaces, price, status, notes, professionalMembershipId } = input;
      const data = { name, description, procedureId, toothNumber, surfaces, price, status, notes, professionalMembershipId, plannedAt: input.plannedAt ? new Date(input.plannedAt) : null, completedAt: input.completedAt ? new Date(input.completedAt) : null };
      if (id) {
        const changed = await tx.patientTreatment.updateMany({ where: { id, clinicId: ctx.clinicId, patientId, version: treatmentUpdateSchema.parse(body).expectedVersion }, data: { ...data, version: { increment: 1 } } });
        if (!changed.count) throw new AppError('CONCURRENCY_ERROR', 'El tratamiento cambió. Recarga antes de guardar.', 409);
      }
      const item = id ? await tx.patientTreatment.findUniqueOrThrow({ where: { id } }) : await tx.patientTreatment.create({ data: { ...data, clinicId: ctx.clinicId, patientId } });
      await this.audit(tx, ctx, id ? 'TREATMENT_UPDATED' : 'TREATMENT_CREATED', item.id, JSON.parse(JSON.stringify({ before: previous, after: item })));
      return item;
    });
  }
  createBudget(ctx: AuthContext, patientId: string, body: unknown) {
    const input = budgetSchema.parse(body);
    return this.transaction(async tx => {
      await this.access(tx, ctx, patientId, true);
      const treatments = await tx.patientTreatment.findMany({ where: { clinicId: ctx.clinicId, patientId, id: { in: input.treatmentIds }, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'asc' } });
      if (treatments.length !== input.treatmentIds.length) throw new AppError('VALIDATION_ERROR', 'Selecciona tratamientos vigentes de este paciente.', 400);
      const subtotal = treatments.reduce((sum, t) => sum + cents(t.price), 0);
      const discount = cents(input.discount);
      if (discount > subtotal) throw new AppError('VALIDATION_ERROR', 'El descuento supera el subtotal.', 400);
      const budget = await tx.treatmentBudget.create({ data: {
        folio: `P-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`, clinicId: ctx.clinicId, patientId, subtotal: money(subtotal), discount: money(discount), total: money(subtotal - discount),
        items: { create: treatments.map((t): Prisma.TreatmentBudgetItemUncheckedCreateWithoutBudgetInput => ({ treatmentId: t.id, name: t.name, description: t.description, toothNumber: t.toothNumber, surfaces: t.surfaces, price: t.price })) },
      }, include: { items: true } });
      await this.audit(tx, ctx, 'BUDGET_CREATED', budget.id, { treatmentIds: input.treatmentIds, total: budget.total.toString() });
      return budget;
    });
  }
  updateBudget(ctx: AuthContext, patientId: string, id: string, body: unknown) {
    const input = budgetUpdateSchema.parse(body);
    return this.transaction(async tx => {
      await this.access(tx, ctx, patientId, true);
      const previous = await tx.treatmentBudget.findFirst({ where: { id, clinicId: ctx.clinicId, patientId } });
      if (!previous) throw new AppError('NOT_FOUND', 'Presupuesto no encontrado.', 404);
      if ('discount' in input) {
        if (!['DRAFT', 'PRESENTED'].includes(previous.status)) throw new AppError('BUDGET_LOCKED', 'Este presupuesto ya fue aceptado o rechazado y no puede editarse.', 409);
        const discount = cents(input.discount);
        if (discount > cents(previous.subtotal)) throw new AppError('VALIDATION_ERROR', 'El descuento no puede superar el subtotal del presupuesto.', 400);
        const before = { discount: previous.discount.toString(), total: previous.total.toString() };
        const after = { discount: money(discount), total: money(cents(previous.subtotal) - discount) };
        const result = await tx.treatmentBudget.updateMany({ where: { id, clinicId: ctx.clinicId, patientId, version: input.expectedVersion }, data: { ...after, version: { increment: 1 } } });
        if (!result.count) throw new AppError('CONCURRENCY_ERROR', 'El presupuesto cambió. Cierra y vuelve a abrir la edición para cargar la versión actual.', 409);
        await this.audit(tx, ctx, 'BUDGET_DISCOUNT_UPDATED', id, { before, after });
        return tx.treatmentBudget.findUniqueOrThrow({ where: { id }, include: { items: true } });
      }
      const transitions: Record<string, string[]> = { DRAFT: ['PRESENTED'], PRESENTED: ['ACCEPTED', 'REJECTED'], ACCEPTED: [], REJECTED: [] };
      if (!transitions[previous.status]?.includes(input.status)) throw new AppError('INVALID_TRANSITION', 'Cambio de estado no permitido.', 409);
      const result = await tx.treatmentBudget.updateMany({ where: { id, clinicId: ctx.clinicId, patientId, version: input.expectedVersion }, data: { status: input.status, version: { increment: 1 } } });
      if (!result.count) throw new AppError('CONCURRENCY_ERROR', 'El presupuesto cambió. Recarga.', 409);
      await this.audit(tx, ctx, 'BUDGET_STATUS_UPDATED', id, { before: previous.status, after: input.status });
      return tx.treatmentBudget.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
  }
  private async scopedBudget(tx: Tx, ctx: AuthContext, patientId: string, id: string) {
    const budget = await tx.treatmentBudget.findFirst({ where: { id, clinicId: ctx.clinicId, patientId }, include: { items: { orderBy: { id: 'asc' } }, payments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { createdBy: { select: { user: { select: { firstName: true, lastName: true } } } }, cancelledBy: { select: { user: { select: { firstName: true, lastName: true } } } } } } } });
    if (!budget) throw new AppError('NOT_FOUND', 'Presupuesto no encontrado.', 404);
    return budget;
  }
  paymentHistory(ctx: AuthContext, patientId: string, id: string) {
    return this.transaction(async tx => {
      await this.access(tx, ctx, patientId);
      const budget = await this.scopedBudget(tx, ctx, patientId, id);
      return { ...budget, ...budgetFinances(budget.total, budget.payments) };
    });
  }
  printBudget(ctx: AuthContext, patientId: string, id: string) {
    return this.transaction(async tx => {
      await this.access(tx, ctx, patientId);
      const budget = await this.scopedBudget(tx, ctx, patientId, id);
      const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: ctx.clinicId }, select: { name: true, timeZone: true, clinicalSpecialty: true } });
      const patient = await tx.patient.findFirstOrThrow({ where: { id: patientId, clinicId: ctx.clinicId }, select: { firstName: true, lastName: true, secondLastName: true } });
      const { payments, ...snapshot } = budget;
      return { clinic: { ...clinic, dentalClinicalTools: capabilitiesFor(clinic.clinicalSpecialty).dentalClinicalTools }, patient, budget: { ...snapshot, ...budgetFinances(budget.total, payments) } };
    });
  }
  createPayment(ctx: AuthContext, patientId: string, id: string, body: unknown) {
    const input = paymentSchema.parse(body);
    return this.transaction(async tx => {
      await this.access(tx, ctx, patientId, true);
      const budget = await this.scopedBudget(tx, ctx, patientId, id);
      if (budget.status !== 'ACCEPTED') throw new AppError('INVALID_BUDGET_STATUS', 'Solo los presupuestos aceptados pueden recibir abonos.', 409);
      if (cents(input.amount) > cents(budgetFinances(budget.total, budget.payments).balance)) throw new AppError('OVERPAYMENT', 'El monto supera el saldo pendiente. Recarga el presupuesto.', 409);
      // Shared budget write makes simultaneous collections conflict under Serializable.
      await tx.treatmentBudget.update({ where: { id }, data: { version: { increment: 1 } } });
      const payment = await tx.budgetPayment.create({ data: { ...input, paidAt: new Date(input.paidAt), clinicId: ctx.clinicId, patientId, budgetId: id, createdByMembershipId: ctx.membershipId } });
      await this.audit(tx, ctx, 'PAYMENT_CREATED', payment.id, { budgetId: id, patientId, amount: input.amount, method: input.method, paidAt: input.paidAt });
      return payment;
    });
  }
  cancelPayment(ctx: AuthContext, patientId: string, id: string, paymentId: string, body: unknown) {
    const input = paymentCancellationSchema.parse(body);
    return this.transaction(async tx => {
      await this.access(tx, ctx, patientId);
      const budget = await this.scopedBudget(tx, ctx, patientId, id);
      const payment = budget.payments.find(p => p.id === paymentId);
      if (!payment) throw new AppError('NOT_FOUND', 'Pago no encontrado.', 404);
      if (payment.status !== 'ACTIVE') throw new AppError('PAYMENT_CANCELLED', 'El pago ya está cancelado.', 409);
      await tx.treatmentBudget.update({ where: { id }, data: { version: { increment: 1 } } });
      const result = await tx.budgetPayment.update({ where: { id: paymentId }, data: { status: 'CANCELLED', ...input, cancelledAt: new Date(), cancelledByMembershipId: ctx.membershipId } });
      await this.audit(tx, ctx, 'PAYMENT_CANCELLED', paymentId, { budgetId: id, patientId, amount: payment.amount.toString(), ...input });
      return result;
    });
  }

}
