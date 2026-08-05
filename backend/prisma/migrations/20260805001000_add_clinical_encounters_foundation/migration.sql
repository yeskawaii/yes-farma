-- CreateEnum
CREATE TYPE "ClinicalEncounterStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "ClinicalEncounter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalMembershipId" UUID NOT NULL,
    "appointmentId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ClinicalEncounterStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reasonForVisit" TEXT,
    "relevantHistory" TEXT,
    "allergies" TEXT,
    "currentMedications" TEXT,
    "physicalExamination" TEXT,
    "indications" TEXT,
    "clinicalNotes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByMembershipId" UUID NOT NULL,
    "updatedByMembershipId" UUID NOT NULL,
    "finalizedAt" TIMESTAMPTZ(3),
    "finalizedByMembershipId" UUID,

    CONSTRAINT "ClinicalEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalVitalSigns" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "systolicBloodPressure" INTEGER,
    "diastolicBloodPressure" INTEGER,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "temperatureCelsius" DECIMAL(4,1),
    "oxygenSaturationPercent" INTEGER,
    "weightKg" DECIMAL(6,2),
    "heightCm" INTEGER,
    "measuredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicalVitalSigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDiagnosis" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "code" VARCHAR(64),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalProcedure" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "code" VARCHAR(64),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalEncounterAmendment" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "createdByMembershipId" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalEncounterAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalEncounter_appointmentId_key" ON "ClinicalEncounter"("appointmentId");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_clinicId_patientId_occurredAt_idx" ON "ClinicalEncounter"("clinicId", "patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_clinicId_professionalMembershipId_occurr_idx" ON "ClinicalEncounter"("clinicId", "professionalMembershipId", "occurredAt");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_clinicId_status_occurredAt_idx" ON "ClinicalEncounter"("clinicId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_clinicId_updatedAt_idx" ON "ClinicalEncounter"("clinicId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalEncounter_clinicId_id_key" ON "ClinicalEncounter"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalVitalSigns_clinicId_encounterId_key" ON "ClinicalVitalSigns"("clinicId", "encounterId");

-- CreateIndex
CREATE INDEX "ClinicalVitalSigns_clinicId_measuredAt_idx" ON "ClinicalVitalSigns"("clinicId", "measuredAt");

-- CreateIndex
CREATE INDEX "ClinicalDiagnosis_clinicId_encounterId_sortOrder_idx" ON "ClinicalDiagnosis"("clinicId", "encounterId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalDiagnosis_clinicId_encounterId_isPrimary_key" ON "ClinicalDiagnosis"("clinicId", "encounterId") WHERE "isPrimary" = true;

-- CreateIndex
CREATE INDEX "ClinicalProcedure_clinicId_encounterId_sortOrder_idx" ON "ClinicalProcedure"("clinicId", "encounterId", "sortOrder");

-- CreateIndex
CREATE INDEX "ClinicalEncounterAmendment_clinicId_encounterId_createdAt_idx" ON "ClinicalEncounterAmendment"("clinicId", "encounterId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_professionalMembershipId_fkey" FOREIGN KEY ("professionalMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_finalizedByMembershipId_fkey" FOREIGN KEY ("finalizedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "ClinicalVitalSigns_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDiagnosis" ADD CONSTRAINT "ClinicalDiagnosis_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "ClinicalProcedure_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounterAmendment" ADD CONSTRAINT "ClinicalEncounterAmendment_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounterAmendment" ADD CONSTRAINT "ClinicalEncounterAmendment_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check Constraints for ClinicalEncounter
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "chk_clinicalencounter_version" CHECK ("version" >= 1);
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "chk_clinicalencounter_finalization" CHECK (
  ("status" = 'DRAFT' AND "finalizedAt" IS NULL AND "finalizedByMembershipId" IS NULL) OR
  ("status" = 'FINALIZED' AND "finalizedAt" IS NOT NULL AND "finalizedByMembershipId" IS NOT NULL)
);

-- Check Constraints for ClinicalVitalSigns
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_sys_bp" CHECK ("systolicBloodPressure" IS NULL OR ("systolicBloodPressure" >= 30 AND "systolicBloodPressure" <= 300));
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_dia_bp" CHECK ("diastolicBloodPressure" IS NULL OR ("diastolicBloodPressure" >= 20 AND "diastolicBloodPressure" <= 200));
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_bp_logic" CHECK ("systolicBloodPressure" IS NULL OR "diastolicBloodPressure" IS NULL OR ("systolicBloodPressure" > "diastolicBloodPressure"));
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_hr" CHECK ("heartRate" IS NULL OR ("heartRate" >= 20 AND "heartRate" <= 300));
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_rr" CHECK ("respiratoryRate" IS NULL OR ("respiratoryRate" >= 5 AND "respiratoryRate" <= 80));
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_temp" CHECK ("temperatureCelsius" IS NULL OR ("temperatureCelsius" >= 25.0 AND "temperatureCelsius" <= 45.0));
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_oxy" CHECK ("oxygenSaturationPercent" IS NULL OR ("oxygenSaturationPercent" >= 0 AND "oxygenSaturationPercent" <= 100));
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_weight" CHECK ("weightKg" IS NULL OR ("weightKg" >= 0.5 AND "weightKg" <= 500));
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_height" CHECK ("heightCm" IS NULL OR ("heightCm" >= 20 AND "heightCm" <= 300));
ALTER TABLE "ClinicalVitalSigns" ADD CONSTRAINT "chk_clinicalvitalsigns_at_least_one" CHECK (
  "systolicBloodPressure" IS NOT NULL OR
  "diastolicBloodPressure" IS NOT NULL OR
  "heartRate" IS NOT NULL OR
  "respiratoryRate" IS NOT NULL OR
  "temperatureCelsius" IS NOT NULL OR
  "oxygenSaturationPercent" IS NOT NULL OR
  "weightKg" IS NOT NULL OR
  "heightCm" IS NOT NULL
);

-- Check Constraints for ClinicalDiagnosis
ALTER TABLE "ClinicalDiagnosis" ADD CONSTRAINT "chk_clinicaldiagnosis_sort" CHECK ("sortOrder" >= 0);
ALTER TABLE "ClinicalDiagnosis" ADD CONSTRAINT "chk_clinicaldiagnosis_desc" CHECK (trim("description") <> '');

-- Check Constraints for ClinicalProcedure
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "chk_clinicalprocedure_sort" CHECK ("sortOrder" >= 0);
ALTER TABLE "ClinicalProcedure" ADD CONSTRAINT "chk_clinicalprocedure_desc" CHECK (trim("description") <> '');

-- Check Constraints for ClinicalEncounterAmendment
ALTER TABLE "ClinicalEncounterAmendment" ADD CONSTRAINT "chk_clinicalencounteramendment_reason" CHECK (trim("reason") <> '');
ALTER TABLE "ClinicalEncounterAmendment" ADD CONSTRAINT "chk_clinicalencounteramendment_note" CHECK (trim("note") <> '');
