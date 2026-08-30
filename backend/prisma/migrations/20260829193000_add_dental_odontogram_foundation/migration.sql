-- CreateEnum
CREATE TYPE "DentalFindingType" AS ENUM ('CARIES', 'RESTORATION', 'CROWN', 'ENDODONTIC_TREATMENT', 'IMPLANT', 'MISSING', 'FRACTURE', 'EXTRACTION_INDICATED', 'PROSTHESIS', 'OTHER');

-- CreateEnum
CREATE TYPE "ToothSurface" AS ENUM ('MESIAL', 'DISTAL', 'VESTIBULAR', 'LINGUAL_PALATAL', 'OCCLUSAL', 'INCISAL', 'WHOLE_TOOTH');

-- CreateEnum
CREATE TYPE "DentalFindingStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DentalFinding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "toothNumber" INTEGER NOT NULL,
    "findingType" "DentalFindingType" NOT NULL,
    "surfaces" "ToothSurface"[] NOT NULL,
    "status" "DentalFindingStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "encounterId" UUID,
    "resolutionEncounterId" UUID,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedByMembershipId" UUID,
    "cancellationReason" VARCHAR(500),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledByMembershipId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByMembershipId" UUID NOT NULL,
    "updatedByMembershipId" UUID NOT NULL,

    CONSTRAINT "DentalFinding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_dental_finding_tooth_fdi" CHECK ("toothNumber" IN (11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48)),
    CONSTRAINT "chk_dental_finding_version" CHECK ("version" >= 1),
    CONSTRAINT "chk_dental_finding_status_consistency" CHECK (
        ("status" = 'ACTIVE' AND "resolvedAt" IS NULL AND "resolvedByMembershipId" IS NULL AND "resolutionNotes" IS NULL AND "resolutionEncounterId" IS NULL AND "cancelledAt" IS NULL AND "cancelledByMembershipId" IS NULL AND "cancellationReason" IS NULL)
        OR ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "resolvedByMembershipId" IS NOT NULL AND "cancelledAt" IS NULL AND "cancelledByMembershipId" IS NULL AND "cancellationReason" IS NULL)
        OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledByMembershipId" IS NOT NULL AND "cancellationReason" IS NOT NULL AND "resolvedAt" IS NULL AND "resolvedByMembershipId" IS NULL AND "resolutionNotes" IS NULL AND "resolutionEncounterId" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "DentalFinding_clinicId_id_key" ON "DentalFinding"("clinicId", "id");

-- CreateIndex
CREATE INDEX "DentalFinding_clinicId_patientId_status_idx" ON "DentalFinding"("clinicId", "patientId", "status");

-- CreateIndex
CREATE INDEX "DentalFinding_clinicId_patientId_toothNumber_idx" ON "DentalFinding"("clinicId", "patientId", "toothNumber");

-- CreateIndex
CREATE INDEX "DentalFinding_clinicId_encounterId_idx" ON "DentalFinding"("clinicId", "encounterId");

-- CreateIndex
CREATE INDEX "DentalFinding_clinicId_resolutionEncounterId_idx" ON "DentalFinding"("clinicId", "resolutionEncounterId");

-- CreateIndex
CREATE INDEX "DentalFinding_clinicId_updatedAt_idx" ON "DentalFinding"("clinicId", "updatedAt");

-- AddForeignKey
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_clinicId_resolutionEncounterId_fkey" FOREIGN KEY ("clinicId", "resolutionEncounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_clinicId_createdByMembershipId_fkey" FOREIGN KEY ("clinicId", "createdByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_clinicId_updatedByMembershipId_fkey" FOREIGN KEY ("clinicId", "updatedByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_clinicId_resolvedByMembershipId_fkey" FOREIGN KEY ("clinicId", "resolvedByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_clinicId_cancelledByMembershipId_fkey" FOREIGN KEY ("clinicId", "cancelledByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
