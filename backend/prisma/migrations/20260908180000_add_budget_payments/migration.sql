-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "BudgetPayment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" DATE NOT NULL,
    "reference" VARCHAR(200),
    "notes" VARCHAR(2000),
    "status" "PaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByMembershipId" UUID NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledByMembershipId" UUID,
    "cancellationReason" VARCHAR(500),

    CONSTRAINT "BudgetPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetPayment_clinicId_patientId_budgetId_createdAt_idx" ON "BudgetPayment"("clinicId", "patientId", "budgetId", "createdAt");

-- AddForeignKey
ALTER TABLE "BudgetPayment" ADD CONSTRAINT "BudgetPayment_clinicId_patientId_budgetId_fkey" FOREIGN KEY ("clinicId", "patientId", "budgetId") REFERENCES "TreatmentBudget"("clinicId", "patientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPayment" ADD CONSTRAINT "BudgetPayment_clinicId_createdByMembershipId_fkey" FOREIGN KEY ("clinicId", "createdByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPayment" ADD CONSTRAINT "BudgetPayment_clinicId_cancelledByMembershipId_fkey" FOREIGN KEY ("clinicId", "cancelledByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "BudgetPayment" ADD CONSTRAINT "BudgetPayment_positive_amount" CHECK (amount > 0 AND amount <> 'NaN'::numeric);
ALTER TABLE "BudgetPayment" ADD CONSTRAINT "BudgetPayment_cancellation_state" CHECK (
  (status = 'ACTIVE' AND "cancelledAt" IS NULL AND "cancelledByMembershipId" IS NULL AND "cancellationReason" IS NULL)
  OR (status = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledByMembershipId" IS NOT NULL AND length(trim("cancellationReason")) > 0 AND "cancellationReason" IS NOT NULL)
);

-- Nullable for legacy budgets: no backfill or rewrite of historical snapshots.
ALTER TABLE "TreatmentBudget" ADD COLUMN "folio" VARCHAR(32);
CREATE UNIQUE INDEX "TreatmentBudget_clinicId_folio_key" ON "TreatmentBudget"("clinicId", "folio");
