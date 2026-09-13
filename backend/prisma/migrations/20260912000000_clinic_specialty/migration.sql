CREATE TYPE "ClinicalSpecialty" AS ENUM ('DENTISTRY', 'PEDIATRICS');
ALTER TABLE "Clinic" ADD COLUMN "clinicalSpecialty" "ClinicalSpecialty" NOT NULL DEFAULT 'DENTISTRY';
ALTER TABLE "Patient" ADD COLUMN "guardianName" VARCHAR(200), ADD COLUMN "guardianPhone" VARCHAR(50), ADD COLUMN "guardianRelationship" VARCHAR(100);
ALTER TABLE "ClinicalVitalSigns" ALTER COLUMN "heightCm" TYPE DOUBLE PRECISION USING "heightCm"::DOUBLE PRECISION;
