-- PHASE 2 Migration: Appointments + Attendance + Salary
-- Preferred execution: copy this SQL and run it in Supabase SQL Editor.
-- Optional CLI execution only if Prisma DB connection works:
-- yarn prisma db execute --file ./prisma/migrations/phase_2_appointments_attendance_salary/migration.sql --schema ./prisma/schema.prisma
--
-- Also required (one-time, out of band):
--   1. Create a PRIVATE Supabase Storage bucket named `employee-documents`
--      (Storage → New bucket → uncheck Public).
--   2. Set backend env vars:
--        SUPABASE_URL=...
--        SUPABASE_SERVICE_ROLE_KEY=...
--        SUPABASE_STORAGE_EMPLOYEE_BUCKET=employee-documents

-- Enums ---------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'sample_collected', 'cancelled', 'rescheduled', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'half_day', 'leave');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- StoredFile ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "StoredFile" (
  "id"            TEXT PRIMARY KEY,
  "bucket"        TEXT NOT NULL,
  "path"          TEXT NOT NULL,
  "originalName"  TEXT NOT NULL,
  "mimeType"      TEXT NOT NULL,
  "size"          INTEGER NOT NULL,
  "documentType"  TEXT NOT NULL,
  "entityType"    TEXT NOT NULL,
  "entityId"      TEXT,
  "uploadedById"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StoredFile_entity_idx" ON "StoredFile"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "StoredFile_documentType_idx" ON "StoredFile"("documentType");

-- Appointment ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Appointment" (
  "id"                TEXT PRIMARY KEY,
  "name"              TEXT NOT NULL,
  "mobile"            TEXT NOT NULL,
  "ageValue"          INTEGER NOT NULL DEFAULT 0,
  "ageUnit"           TEXT NOT NULL DEFAULT 'years',
  "sex"               "Sex" NOT NULL,
  "referredDoctor"    TEXT,
  "procedure"         TEXT NOT NULL,
  "appointmentDate"   DATE NOT NULL,
  "appointmentTime"   TEXT,
  "status"            "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
  "notes"             TEXT,
  "linkedPatientId"   TEXT,
  "createdById"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Appointment_appointmentDate_idx" ON "Appointment"("appointmentDate");
CREATE INDEX IF NOT EXISTS "Appointment_status_idx" ON "Appointment"("status");
CREATE INDEX IF NOT EXISTS "Appointment_linkedPatientId_idx" ON "Appointment"("linkedPatientId");

DO $$ BEGIN
  ALTER TABLE "Appointment"
    ADD CONSTRAINT "Appointment_linkedPatientId_fkey"
    FOREIGN KEY ("linkedPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Employee ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Employee" (
  "id"                   TEXT PRIMARY KEY,
  "name"                 TEXT NOT NULL,
  "mobile"               TEXT,
  "designation"          TEXT,
  "monthlySalary"        DECIMAL(10,2) NOT NULL DEFAULT 0,
  "active"               BOOLEAN NOT NULL DEFAULT TRUE,
  "linkedUserId"         TEXT,
  "aadhaarDocumentId"    TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Employee_active_idx" ON "Employee"("active");

DO $$ BEGIN
  ALTER TABLE "Employee"
    ADD CONSTRAINT "Employee_linkedUserId_fkey"
    FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Employee"
    ADD CONSTRAINT "Employee_aadhaarDocumentId_fkey"
    FOREIGN KEY ("aadhaarDocumentId") REFERENCES "StoredFile"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Attendance ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Attendance" (
  "id"          TEXT PRIMARY KEY,
  "employeeId"  TEXT NOT NULL,
  "date"        DATE NOT NULL,
  "status"      "AttendanceStatus" NOT NULL,
  "notes"       TEXT,
  "markedById"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_employeeId_date_key" ON "Attendance"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "Attendance_date_idx" ON "Attendance"("date");

DO $$ BEGIN
  ALTER TABLE "Attendance"
    ADD CONSTRAINT "Attendance_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SalaryAdvance -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "SalaryAdvance" (
  "id"          TEXT PRIMARY KEY,
  "employeeId"  TEXT NOT NULL,
  "date"        DATE NOT NULL,
  "amount"      DECIMAL(10,2) NOT NULL,
  "notes"       TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SalaryAdvance_employeeId_date_idx" ON "SalaryAdvance"("employeeId", "date");

DO $$ BEGIN
  ALTER TABLE "SalaryAdvance"
    ADD CONSTRAINT "SalaryAdvance_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
