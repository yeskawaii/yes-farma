import { Prisma, PrismaClient } from '../../../generated/prisma';
import { AuthContext } from '../../../middlewares/auth';
import { AppError } from '../../../shared/errors/AppError';
import { addsStock, balance, clinicDate, expiryState, EXPIRY_WARNING_DAYS, movementLabels, movementSchema, productSchema, productUpdateSchema, stockState, supplierSchema, supplierUpdateSchema } from '../domain/InventorySchema';

type Tx = Prisma.TransactionClient;
const actor = { select: { user: { select: { firstName: true, lastName: true } } } } as const;
export class InventoryService {
  constructor(private readonly db: PrismaClient, private readonly now = () => new Date()) {}
  private async transaction<T>(fn: (tx: Tx) => Promise<T>) {
    try { return await this.db.$transaction(fn, { isolationLevel: 'Serializable' }); }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') throw new AppError('CONCURRENCY_ERROR', 'El inventario cambió. Actualiza las existencias antes de intentar nuevamente.', 409); throw e; }
  }
  private async access(tx: Tx, ctx: AuthContext, admin = false) {
    const membership = await tx.membership.findFirst({ where: { id: ctx.membershipId, clinicId: ctx.clinicId, userId: ctx.userId, status: 'ACTIVE', user: { status: 'ACTIVE' }, clinic: { status: 'ACTIVE' } }, include: { clinic: true } });
    if (!membership || (admin && membership.role !== 'OWNER')) throw new AppError('FORBIDDEN', 'No tienes permiso para esta operación de inventario.', 403);
    return { today: clinicDate(this.now(), membership.clinic.timeZone), timeZone: membership.clinic.timeZone, canManage: membership.role === 'OWNER' };
  }
  private audit(tx: Tx, ctx: AuthContext, action: string, entityType: string, entityId: string, metadata: unknown) {
    return tx.auditEvent.create({ data: { clinicId: ctx.clinicId, actorUserId: ctx.userId, action, entityType, entityId, metadata: JSON.parse(JSON.stringify(metadata)) } });
  }
  private async supplier(tx: Tx, ctx: AuthContext, id: string | null) {
    if (id && !await tx.inventorySupplier.findFirst({ where: { id, clinicId: ctx.clinicId, active: true } })) throw new AppError('INVALID_SUPPLIER', 'Proveedor inactivo o no disponible.', 400);
  }
  saveSupplier(ctx: AuthContext, body: unknown, id?: string) {
    const parsed = id ? supplierUpdateSchema.parse(body) : supplierSchema.parse(body);
    const { name, contact, phone, email, notes, active } = parsed;
    const data = { name, contact, phone, email, notes, active };
    return this.transaction(async tx => {
      await this.access(tx, ctx, true);
      const before = id ? await tx.inventorySupplier.findFirst({ where: { id, clinicId: ctx.clinicId } }) : null;
      if (id && !before) throw new AppError('NOT_FOUND', 'Proveedor no encontrado.', 404);
      if (id && !(await tx.inventorySupplier.updateMany({ where: { id, clinicId: ctx.clinicId, version: supplierUpdateSchema.parse(body).expectedVersion }, data: { ...data, version: { increment: 1 } } })).count) throw new AppError('CONCURRENCY_ERROR', 'El proveedor cambió. Recarga antes de editar.', 409);
      const item = id ? await tx.inventorySupplier.findFirstOrThrow({ where: { id, clinicId: ctx.clinicId } }) : await tx.inventorySupplier.create({ data: { ...data, clinicId: ctx.clinicId } });
      await this.audit(tx, ctx, !id ? 'INVENTORY_SUPPLIER_CREATED' : !active ? 'INVENTORY_SUPPLIER_DEACTIVATED' : 'INVENTORY_SUPPLIER_UPDATED', 'InventorySupplier', item.id, { before, after: item }); return item;
    });
  }
  saveProduct(ctx: AuthContext, body: unknown, id?: string) {
    const parsed = id ? productUpdateSchema.parse(body) : productSchema.parse(body);
    const { name, description, category, unit, minimumStock, supplierId, referenceCost, active } = parsed;
    const data = { name, description, category, unit, minimumStock, supplierId, referenceCost, active };
    return this.transaction(async tx => {
      await this.access(tx, ctx, true);
      const before = id ? await tx.inventoryProduct.findFirst({ where: { id, clinicId: ctx.clinicId } }) : null;
      if (id && !before) throw new AppError('NOT_FOUND', 'Producto no encontrado.', 404);
      if (supplierId !== before?.supplierId) await this.supplier(tx, ctx, supplierId);
      if (before && before.unit !== unit && await tx.inventoryMovement.count({ where: { clinicId: ctx.clinicId, productId: before.id } })) throw new AppError('UNIT_LOCKED', 'La unidad no puede cambiar cuando existe historial. Crea otro producto para una unidad diferente.', 409);
      if (id && !(await tx.inventoryProduct.updateMany({ where: { id, clinicId: ctx.clinicId, version: productUpdateSchema.parse(body).expectedVersion }, data: { ...data, version: { increment: 1 } } })).count) throw new AppError('CONCURRENCY_ERROR', 'El producto cambió. Recarga antes de editar.', 409);
      const item = id ? await tx.inventoryProduct.findFirstOrThrow({ where: { id, clinicId: ctx.clinicId } }) : await tx.inventoryProduct.create({ data: { ...data, clinicId: ctx.clinicId } });
      await this.audit(tx, ctx, !id ? 'INVENTORY_PRODUCT_CREATED' : !active ? 'INVENTORY_PRODUCT_DEACTIVATED' : 'INVENTORY_PRODUCT_UPDATED', 'InventoryProduct', item.id, { before, after: item }); return item;
    });
  }
  private async products(tx: Tx, ctx: AuthContext, today: string, id?: string) {
    const rows = await tx.inventoryProduct.findMany({ where: { clinicId: ctx.clinicId, ...(id ? { id } : {}) }, orderBy: { name: 'asc' }, include: { supplier: true, lots: { orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }, { id: 'asc' }], include: { supplier: true } } } });
    const totals = await tx.inventoryMovement.groupBy({ by: ['lotId', 'type'], where: { clinicId: ctx.clinicId, ...(id ? { productId: id } : {}) }, _sum: { quantity: true } });
    const balances = new Map<string, Prisma.Decimal>();
    for (const m of totals) { const prev = balances.get(m.lotId) || new Prisma.Decimal(0); balances.set(m.lotId, addsStock(m.type) ? prev.plus(m._sum.quantity || 0) : prev.minus(m._sum.quantity || 0)); }
    return rows.map(p => {
      const lots = p.lots.map(l => ({ ...l, available: (balances.get(l.id) || new Prisma.Decimal(0)).toString(), ...expiryState(l.expiryDate, today) }));
      const physical = lots.reduce((sum, l) => sum.plus(l.available), new Prisma.Decimal(0));
      const usable = lots.filter(l => l.expiryStatus !== 'EXPIRED').reduce((sum, l) => sum.plus(l.available), new Prisma.Decimal(0));
      const next = lots.find(l => l.expiryDate && new Prisma.Decimal(l.available).gt(0) && l.expiryStatus !== 'EXPIRED');
      return { ...p, lots, stock: physical.toString(), usableStock: usable.toString(), expiredStock: physical.minus(usable).toString(), stockStatus: stockState(usable, p.minimumStock), nextExpiry: next?.expiryDate || null,
        expiring: lots.some(l => l.expiryStatus === 'EXPIRING' && new Prisma.Decimal(l.available).gt(0)), expired: lots.some(l => l.expiryStatus === 'EXPIRED' && new Prisma.Decimal(l.available).gt(0)) };
    });
  }
  list(ctx: AuthContext) {
    return this.transaction(async tx => {
      const access = await this.access(tx, ctx);
      const products = await this.products(tx, ctx, access.today);
      const active = products.filter(p => p.active);
      const suppliers = await tx.inventorySupplier.findMany({ where: { clinicId: ctx.clinicId }, orderBy: { name: 'asc' } });
      const movements = await tx.inventoryMovement.findMany({ where: { clinicId: ctx.clinicId }, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { createdBy: actor, lot: { include: { product: { select: { name: true, unit: true } } } } } });
      return { ...access, expiryWarningDays: EXPIRY_WARNING_DAYS, products, suppliers, movements, summary: { active: active.length, low: active.filter(p => p.stockStatus === 'LOW').length, empty: active.filter(p => p.stockStatus === 'EMPTY').length, expiring: active.filter(p => p.expiring).length, expired: active.filter(p => p.expired).length } };
    });
  }
  detail(ctx: AuthContext, id: string) {
    return this.transaction(async tx => {
      const access = await this.access(tx, ctx);
      const product = (await this.products(tx, ctx, access.today, id))[0];
      if (!product) throw new AppError('NOT_FOUND', 'Producto no encontrado.', 404);
      const movements = await tx.inventoryMovement.findMany({ where: { clinicId: ctx.clinicId, productId: id }, take: 100, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { createdBy: actor, lot: { include: { product: { select: { name: true, unit: true } } } } } });
      return { ...access, product, movements };
    });
  }
  move(ctx: AuthContext, id: string, body: unknown) {
    const input = movementSchema.parse(body);
    return this.transaction(async tx => {
      const access = await this.access(tx, ctx, input.type.startsWith('ADJUSTMENT'));
      if (input.effectiveDate > access.today) throw new AppError('INVALID_DATE', 'No se permiten movimientos con fecha futura.', 400);
      const product = await tx.inventoryProduct.findFirst({ where: { id, clinicId: ctx.clinicId } });
      if (!product) throw new AppError('NOT_FOUND', 'Producto no encontrado.', 404);
      if (!product.active) throw new AppError('PRODUCT_INACTIVE', 'Reactiva el producto antes de registrar movimientos.', 409);
      // All stock writers touch the same product inside Serializable: concurrent snapshots cannot both commit.
      await tx.inventoryProduct.update({ where: { clinicId_id: { clinicId: ctx.clinicId, id } }, data: { version: { increment: 1 } } });
      let lot;
      if (input.lotId) {
        lot = await tx.inventoryLot.findFirst({ where: { id: input.lotId, clinicId: ctx.clinicId, productId: id } });
        if (!lot) throw new AppError('NOT_FOUND', 'Lote no disponible para este producto.', 404);
        if (input.effectiveDate < lot.receivedAt.toISOString().slice(0, 10)) throw new AppError('INVALID_DATE', 'La fecha no puede ser anterior a la recepción.', 400);
        if (input.type === 'CONSUMPTION' && expiryState(lot.expiryDate, access.today).expiryStatus === 'EXPIRED') throw new AppError('LOT_EXPIRED', 'Este lote está caducado y no se puede consumir. Registra merma si corresponde.', 409);
        const movements = await tx.inventoryMovement.findMany({ where: { clinicId: ctx.clinicId, productId: id, lotId: lot.id }, select: { type: true, quantity: true } });
        if (!addsStock(input.type) && balance(movements).lt(input.quantity)) throw new AppError('INSUFFICIENT_STOCK', 'La cantidad supera la existencia disponible del lote. Actualiza el inventario.', 409);
      } else {
        await this.supplier(tx, ctx, input.supplierId);
        lot = await tx.inventoryLot.create({ data: { clinicId: ctx.clinicId, productId: id, number: input.number, expiryDate: input.expiryDate ? new Date(input.expiryDate) : null, receivedAt: new Date(input.effectiveDate), supplierId: input.supplierId, unitCost: input.unitCost, initialQuantity: input.quantity } });
      }
      const movement = await tx.inventoryMovement.create({ data: { clinicId: ctx.clinicId, productId: id, lotId: lot.id, type: input.type, quantity: input.quantity, effectiveDate: new Date(input.effectiveDate), reason: input.reason || (input.type === 'ENTRY' ? 'Recepción de material' : 'Uso clínico'), note: input.note, unitCost: input.unitCost, createdByMembershipId: ctx.membershipId } });
      await this.audit(tx, ctx, `INVENTORY_${input.type}`, 'InventoryMovement', movement.id, movement);
      const current = (await this.products(tx, ctx, access.today, id))[0]!;
      return { movement, product: current, message: `${movementLabels[input.type]} ${['ENTRY', 'WASTE'].includes(input.type) ? 'registrada' : 'registrado'}. Disponible: ${current.usableStock} ${product.unit}. Existencia total: ${current.stock} ${product.unit}.` };
    });
  }
}
