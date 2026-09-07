-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'PRESENTED', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "DentalProcedure" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "defaultPrice" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DentalProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientTreatment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "procedureId" UUID,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "toothNumber" INTEGER,
    "surfaces" "ToothSurface"[],
    "price" DECIMAL(12,2) NOT NULL,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'PENDING',
    "plannedAt" DATE,
    "completedAt" DATE,
    "notes" VARCHAR(2000),
    "professionalMembershipId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PatientTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentBudget" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentBudgetItem" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "treatmentId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "toothNumber" INTEGER,
    "surfaces" "ToothSurface"[],
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "TreatmentBudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DentalProcedure_clinicId_active_idx" ON "DentalProcedure"("clinicId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DentalProcedure_clinicId_id_key" ON "DentalProcedure"("clinicId", "id");

-- CreateIndex
CREATE INDEX "PatientTreatment_clinicId_patientId_status_idx" ON "PatientTreatment"("clinicId", "patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PatientTreatment_clinicId_patientId_id_key" ON "PatientTreatment"("clinicId", "patientId", "id");

-- CreateIndex
CREATE INDEX "TreatmentBudget_clinicId_patientId_createdAt_idx" ON "TreatmentBudget"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentBudget_clinicId_patientId_id_key" ON "TreatmentBudget"("clinicId", "patientId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentBudgetItem_budgetId_treatmentId_key" ON "TreatmentBudgetItem"("budgetId", "treatmentId");

-- AddForeignKey
ALTER TABLE "DentalProcedure" ADD CONSTRAINT "DentalProcedure_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTreatment" ADD CONSTRAINT "PatientTreatment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTreatment" ADD CONSTRAINT "PatientTreatment_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTreatment" ADD CONSTRAINT "PatientTreatment_clinicId_procedureId_fkey" FOREIGN KEY ("clinicId", "procedureId") REFERENCES "DentalProcedure"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTreatment" ADD CONSTRAINT "PatientTreatment_clinicId_professionalMembershipId_fkey" FOREIGN KEY ("clinicId", "professionalMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentBudget" ADD CONSTRAINT "TreatmentBudget_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentBudget" ADD CONSTRAINT "TreatmentBudget_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentBudgetItem" ADD CONSTRAINT "TreatmentBudgetItem_clinicId_patientId_budgetId_fkey" FOREIGN KEY ("clinicId", "patientId", "budgetId") REFERENCES "TreatmentBudget"("clinicId", "patientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentBudgetItem" ADD CONSTRAINT "TreatmentBudgetItem_clinicId_patientId_treatmentId_fkey" FOREIGN KEY ("clinicId", "patientId", "treatmentId") REFERENCES "PatientTreatment"("clinicId", "patientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additional database invariants; only new tables are affected.
ALTER TABLE "DentalProcedure" ADD CONSTRAINT "DentalProcedure_price_check" CHECK ("defaultPrice" >= 0);
ALTER TABLE "PatientTreatment" ADD CONSTRAINT "PatientTreatment_price_check" CHECK ("price" >= 0);
ALTER TABLE "PatientTreatment" ADD CONSTRAINT "PatientTreatment_tooth_check" CHECK (
  "toothNumber" IS NULL OR ("toothNumber" / 10 BETWEEN 1 AND 4 AND "toothNumber" % 10 BETWEEN 1 AND 8)
);
ALTER TABLE "PatientTreatment" ADD CONSTRAINT "PatientTreatment_completed_check" CHECK ("completedAt" IS NULL OR "status" = 'COMPLETED');
ALTER TABLE "TreatmentBudgetItem" ADD CONSTRAINT "TreatmentBudgetItem_price_check" CHECK ("price" >= 0);
ALTER TABLE "TreatmentBudget" ADD CONSTRAINT "TreatmentBudget_totals_check" CHECK (
  "subtotal" >= 0 AND "discount" >= 0 AND "discount" <= "subtotal" AND "total" = "subtotal" - "discount"
);
