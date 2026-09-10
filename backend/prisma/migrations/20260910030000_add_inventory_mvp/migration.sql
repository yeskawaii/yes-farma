-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('ENTRY', 'CONSUMPTION', 'WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateTable
CREATE TABLE "InventorySupplier" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact" VARCHAR(200),
    "phone" VARCHAR(50),
    "email" VARCHAR(254),
    "notes" VARCHAR(2000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventorySupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryProduct" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "category" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "minimumStock" DECIMAL(14,3) NOT NULL,
    "supplierId" UUID,
    "referenceCost" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "number" VARCHAR(100),
    "expiryDate" DATE,
    "receivedAt" DATE NOT NULL,
    "unitCost" DECIMAL(12,2),
    "supplierId" UUID,
    "initialQuantity" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "note" VARCHAR(2000),
    "unitCost" DECIMAL(12,2),
    "createdByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventorySupplier_clinicId_active_idx" ON "InventorySupplier"("clinicId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySupplier_clinicId_id_key" ON "InventorySupplier"("clinicId", "id");

-- CreateIndex
CREATE INDEX "InventoryProduct_clinicId_active_name_idx" ON "InventoryProduct"("clinicId", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryProduct_clinicId_id_key" ON "InventoryProduct"("clinicId", "id");

-- CreateIndex
CREATE INDEX "InventoryLot_clinicId_productId_expiryDate_idx" ON "InventoryLot"("clinicId", "productId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_clinicId_productId_id_key" ON "InventoryLot"("clinicId", "productId", "id");

-- CreateIndex
CREATE INDEX "InventoryMovement_clinicId_createdAt_idx" ON "InventoryMovement"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_clinicId_productId_lotId_idx" ON "InventoryMovement"("clinicId", "productId", "lotId");

-- AddForeignKey
ALTER TABLE "InventorySupplier" ADD CONSTRAINT "InventorySupplier_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryProduct" ADD CONSTRAINT "InventoryProduct_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryProduct" ADD CONSTRAINT "InventoryProduct_clinicId_supplierId_fkey" FOREIGN KEY ("clinicId", "supplierId") REFERENCES "InventorySupplier"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_clinicId_productId_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES "InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_clinicId_supplierId_fkey" FOREIGN KEY ("clinicId", "supplierId") REFERENCES "InventorySupplier"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_clinicId_productId_lotId_fkey" FOREIGN KEY ("clinicId", "productId", "lotId") REFERENCES "InventoryLot"("clinicId", "productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_clinicId_createdByMembershipId_fkey" FOREIGN KEY ("clinicId", "createdByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additional domain constraints; only new inventory tables are affected.
ALTER TABLE "InventoryProduct" ADD CONSTRAINT "InventoryProduct_values_check" CHECK ("minimumStock" >= 0 AND ("referenceCost" IS NULL OR "referenceCost" >= 0) AND version > 0);
ALTER TABLE "InventorySupplier" ADD CONSTRAINT "InventorySupplier_version_check" CHECK (version > 0);
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_values_check" CHECK ("initialQuantity" > 0 AND ("unitCost" IS NULL OR "unitCost" >= 0));
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_values_check" CHECK (quantity > 0 AND length(trim(reason)) > 0 AND ("unitCost" IS NULL OR "unitCost" >= 0));

-- History is append-only even if an accidental update/delete reaches PostgreSQL.
CREATE FUNCTION inventory_movement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory movements are immutable; register a compensating movement' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER inventory_movement_immutable BEFORE UPDATE OR DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION inventory_movement_immutable();
