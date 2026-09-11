-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ProfessionalProfile" ADD COLUMN     "professionalAddress" TEXT,
ADD COLUMN     "professionalPhone" TEXT,
ADD COLUMN     "specialtyLicense" TEXT;

-- CreateTable
CREATE TABLE "Prescription" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "prescriberMembershipId" UUID NOT NULL,
    "encounterId" UUID,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "folio" VARCHAR(40),
    "generalInstructions" VARCHAR(4000) NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "issuedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(500),
    "cancelledByMembershipId" UUID,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "prescriptionId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "medication" VARCHAR(200) NOT NULL,
    "brand" VARCHAR(200) NOT NULL DEFAULT '',
    "concentration" VARCHAR(100) NOT NULL DEFAULT '',
    "form" VARCHAR(100) NOT NULL DEFAULT '',
    "dose" VARCHAR(200) NOT NULL DEFAULT '',
    "route" VARCHAR(100) NOT NULL DEFAULT '',
    "frequency" VARCHAR(200) NOT NULL DEFAULT '',
    "duration" VARCHAR(200) NOT NULL DEFAULT '',
    "quantity" VARCHAR(100) NOT NULL DEFAULT '',
    "instructions" VARCHAR(1000) NOT NULL DEFAULT '',

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_folio_key" ON "Prescription"("folio");

-- CreateIndex
CREATE INDEX "Prescription_clinicId_patientId_createdAt_idx" ON "Prescription"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Prescription_clinicId_encounterId_idx" ON "Prescription"("clinicId", "encounterId");

-- CreateIndex
CREATE INDEX "Prescription_clinicId_prescriberMembershipId_status_idx" ON "Prescription"("clinicId", "prescriberMembershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_clinicId_id_key" ON "Prescription"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionItem_prescriptionId_sortOrder_key" ON "PrescriptionItem"("prescriptionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalEncounter_clinicId_patientId_id_key" ON "ClinicalEncounter"("clinicId", "patientId", "id");

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicId_prescriberMembershipId_fkey" FOREIGN KEY ("clinicId", "prescriberMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicId_patientId_encounterId_fkey" FOREIGN KEY ("clinicId", "patientId", "encounterId") REFERENCES "ClinicalEncounter"("clinicId", "patientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicId_cancelledByMembershipId_fkey" FOREIGN KEY ("clinicId", "cancelledByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_clinicId_prescriptionId_fkey" FOREIGN KEY ("clinicId", "prescriptionId") REFERENCES "Prescription"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Document lifecycle invariants, including writes outside the application.
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_lifecycle_check" CHECK (
  ("status" = 'DRAFT' AND "folio" IS NULL AND "issuedAt" IS NULL AND "snapshot" IS NULL AND "cancelledAt" IS NULL AND "cancelledByMembershipId" IS NULL AND "cancellationReason" IS NULL)
  OR ("status" = 'ISSUED' AND "folio" IS NOT NULL AND "issuedAt" IS NOT NULL AND "snapshot" IS NOT NULL AND "cancelledAt" IS NULL AND "cancelledByMembershipId" IS NULL AND "cancellationReason" IS NULL)
  OR ("status" = 'CANCELLED' AND "folio" IS NOT NULL AND "issuedAt" IS NOT NULL AND "snapshot" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancelledByMembershipId" IS NOT NULL AND "cancellationReason" IS NOT NULL AND length(trim("cancellationReason")) >= 3)
);
