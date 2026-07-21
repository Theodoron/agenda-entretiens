ALTER TABLE "Appointment"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedById" UUID;

CREATE INDEX "Appointment_advisorId_archivedAt_idx"
ON "Appointment"("advisorId", "archivedAt");
