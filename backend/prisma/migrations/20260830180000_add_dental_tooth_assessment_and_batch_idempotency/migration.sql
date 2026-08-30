-- CreateEnum
CREATE TYPE "ToothAssessmentType" AS ENUM ('HEALTHY');

-- AlterTable
ALTER TABLE "DentalFinding" ADD COLUMN "sourceRequestId" UUID;

-- CreateIndex
CREATE INDEX "DentalFinding_clinicId_sourceRequestId_idx" ON "DentalFinding"("clinicId", "sourceRequestId");

-- CreateTable
CREATE TABLE "ToothAssessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "toothNumber" INTEGER NOT NULL,
    "assessmentType" "ToothAssessmentType" NOT NULL DEFAULT 'HEALTHY',
    "notes" TEXT,
    "encounterId" UUID,
    "sourceRequestId" UUID NOT NULL,
    "assessedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessedByMembershipId" UUID NOT NULL,

    CONSTRAINT "ToothAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_tooth_assessment_tooth_fdi" CHECK ("toothNumber" IN (11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48))
);

-- CreateTable
CREATE TABLE "OdontogramBatchRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "createdByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OdontogramBatchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToothAssessment_clinicId_id_key" ON "ToothAssessment"("clinicId", "id");

-- CreateIndex
CREATE INDEX "ToothAssessment_clinicId_patientId_toothNumber_idx" ON "ToothAssessment"("clinicId", "patientId", "toothNumber");

-- CreateIndex
CREATE INDEX "ToothAssessment_clinicId_patientId_assessedAt_idx" ON "ToothAssessment"("clinicId", "patientId", "assessedAt");

-- CreateIndex
CREATE INDEX "ToothAssessment_clinicId_encounterId_idx" ON "ToothAssessment"("clinicId", "encounterId");

-- CreateIndex
CREATE INDEX "ToothAssessment_clinicId_sourceRequestId_idx" ON "ToothAssessment"("clinicId", "sourceRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "OdontogramBatchRequest_clinicId_patientId_requestId_key" ON "OdontogramBatchRequest"("clinicId", "patientId", "requestId");

-- CreateIndex
CREATE INDEX "OdontogramBatchRequest_clinicId_patientId_idx" ON "OdontogramBatchRequest"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "OdontogramBatchRequest_clinicId_requestId_idx" ON "OdontogramBatchRequest"("clinicId", "requestId");

-- CreateIndex
CREATE INDEX "OdontogramBatchRequest_clinicId_createdByMembershipId_idx" ON "OdontogramBatchRequest"("clinicId", "createdByMembershipId");

-- AddForeignKey
ALTER TABLE "ToothAssessment" ADD CONSTRAINT "ToothAssessment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothAssessment" ADD CONSTRAINT "ToothAssessment_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothAssessment" ADD CONSTRAINT "ToothAssessment_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothAssessment" ADD CONSTRAINT "ToothAssessment_clinicId_assessedByMembershipId_fkey" FOREIGN KEY ("clinicId", "assessedByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramBatchRequest" ADD CONSTRAINT "OdontogramBatchRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramBatchRequest" ADD CONSTRAINT "OdontogramBatchRequest_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramBatchRequest" ADD CONSTRAINT "OdontogramBatchRequest_clinicId_createdByMembershipId_fkey" FOREIGN KEY ("clinicId", "createdByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
