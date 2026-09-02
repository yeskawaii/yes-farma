-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationJobType" AS ENUM ('APPOINTMENT_REMINDER_24H', 'DAILY_AGENDA');

-- CreateEnum
CREATE TYPE "NotificationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY_PENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "ClinicNotificationSettings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "appointmentReminder24hEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyAgendaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyAgendaLocalTime" TEXT NOT NULL DEFAULT '07:00',
    "dailyAgendaRecipientPhone" TEXT,
    "defaultCountryCallingCode" TEXT NOT NULL DEFAULT '52',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "appointmentId" UUID,
    "type" "NotificationJobType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationJobStatus" NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "appointmentStartAtSnapshot" TIMESTAMPTZ(3),
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "processingStartedAt" TIMESTAMPTZ(3),
    "recipientPhone" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "providerMessageId" TEXT,
    "failureCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicNotificationSettings_clinicId_key" ON "ClinicNotificationSettings"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_clinicId_id_key" ON "Appointment"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationJob_clinicId_idempotencyKey_key" ON "NotificationJob"("clinicId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationJob_status_scheduledFor_idx" ON "NotificationJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationJob_clinicId_status_scheduledFor_idx" ON "NotificationJob"("clinicId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationJob_appointmentId_idx" ON "NotificationJob"("appointmentId");

-- CreateIndex
CREATE INDEX "NotificationJob_clinicId_appointmentId_idx" ON "NotificationJob"("clinicId", "appointmentId");

-- AddForeignKey
ALTER TABLE "ClinicNotificationSettings" ADD CONSTRAINT "ClinicNotificationSettings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_clinicId_appointmentId_fkey" FOREIGN KEY ("clinicId", "appointmentId") REFERENCES "Appointment"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
