-- CreateEnum
CREATE TYPE "PatientDocumentCategory" AS ENUM ('RADIOGRAPH', 'LAB_RESULT', 'PRESCRIPTION', 'CONSENT', 'IDENTIFICATION', 'CLINICAL_IMAGE', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PatientDocumentStatus" AS ENUM ('PENDING', 'ACTIVE', 'DELETED');

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicalEncounterId" UUID,
    "category" "PatientDocumentCategory" NOT NULL,
    "status" "PatientDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "storageProvider" TEXT NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "uploadedByMembershipId" UUID NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedByMembershipId" UUID,

    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientDocument_clinicId_patientId_status_createdAt_idx" ON "PatientDocument"("clinicId", "patientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PatientDocument_clinicId_clinicalEncounterId_status_idx" ON "PatientDocument"("clinicId", "clinicalEncounterId", "status");

-- CreateIndex
CREATE INDEX "PatientDocument_clinicId_status_createdAt_idx" ON "PatientDocument"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientDocument_clinicId_id_key" ON "PatientDocument"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PatientDocument_storageProvider_storageBucket_storageKey_key" ON "PatientDocument"("storageProvider", "storageBucket", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_clinicId_id_key" ON "Membership"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_id_key" ON "Patient"("clinicId", "id");

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_clinicId_clinicalEncounterId_fkey" FOREIGN KEY ("clinicId", "clinicalEncounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_clinicId_uploadedByMembershipId_fkey" FOREIGN KEY ("clinicId", "uploadedByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_clinicId_deletedByMembershipId_fkey" FOREIGN KEY ("clinicId", "deletedByMembershipId") REFERENCES "Membership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
