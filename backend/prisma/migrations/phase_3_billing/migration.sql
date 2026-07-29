-- PHASE 3 Migration: Optional Patient Bill Printing
-- Preferred execution: copy this SQL and run it in Supabase SQL Editor.
-- Optional CLI execution only if Prisma DB connection works:
-- yarn prisma db execute --file ./prisma/migrations/phase_3_billing/migration.sql --schema ./prisma/schema.prisma
--
-- Safe / idempotent. Creates Bill + BillItem only. Touches NO existing table,
-- so ledger / payment / cash logic is completely unaffected.

BEGIN;

CREATE TABLE IF NOT EXISTS "Bill" (
  "id"                            TEXT PRIMARY KEY,
  "billNumber"                    INTEGER NOT NULL,
  "financialYear"                 TEXT NOT NULL,
  "billDate"                      DATE NOT NULL,

  "patientId"                     TEXT NOT NULL,

  "patientRegisterNumberSnapshot" INTEGER NOT NULL,
  "patientFinancialYearSnapshot"  TEXT NOT NULL,
  "patientNameSnapshot"           TEXT NOT NULL,
  "patientAgeSnapshot"            TEXT NOT NULL,
  "patientSexSnapshot"            "Sex" NOT NULL,
  "patientMobileSnapshot"         TEXT,
  "referredDoctorSnapshot"        TEXT,

  "totalAmount"                   DECIMAL(10,2) NOT NULL DEFAULT 0,
  "discount"                      DECIMAL(10,2) NOT NULL DEFAULT 0,
  "netAmount"                     DECIMAL(10,2) NOT NULL DEFAULT 0,
  "paidAmount"                    DECIMAL(10,2) NOT NULL DEFAULT 0,
  "balanceAmount"                 DECIMAL(10,2) NOT NULL DEFAULT 0,
  "amountInWords"                 TEXT NOT NULL,

  "createdById"                   TEXT,
  "printedAt"                     TIMESTAMP(3),
  "printedById"                   TEXT,
  "printCount"                    INTEGER NOT NULL DEFAULT 0,
  "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "BillItem" (
  "id"            TEXT PRIMARY KEY,
  "billId"        TEXT NOT NULL,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "testName"      TEXT NOT NULL,
  "testCode"      TEXT,
  "outsourcedLab" TEXT,
  "rate"          DECIMAL(10,2) NOT NULL,
  "quantity"      INTEGER NOT NULL DEFAULT 1,
  "amount"        DECIMAL(10,2) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foreign keys ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Bill_patientId_fkey') THEN
    ALTER TABLE "Bill"
      ADD CONSTRAINT "Bill_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillItem_billId_fkey') THEN
    ALTER TABLE "BillItem"
      ADD CONSTRAINT "BillItem_billId_fkey"
      FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Uniques + indexes ----------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "Bill_billNumber_key"
  ON "Bill"("billNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Bill_financialYear_billNumber_key"
  ON "Bill"("financialYear", "billNumber");
CREATE INDEX IF NOT EXISTS "Bill_patientId_idx" ON "Bill"("patientId");
CREATE INDEX IF NOT EXISTS "Bill_billDate_idx"  ON "Bill"("billDate");
CREATE INDEX IF NOT EXISTS "BillItem_billId_idx" ON "BillItem"("billId");

COMMIT;
