-- Phase 1.5 — Financial-Year patient numbering
-- Run this in Supabase SQL Editor (or `prisma migrate deploy` if direct connection works).
-- Safe to run once. Backfills existing rows from entryDate.

BEGIN;

-- 1. Add nullable columns first so existing rows can be backfilled.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "financialYear"  TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "registerNumber" INTEGER;

-- 2. Backfill financialYear from entryDate.
--    FY starts 1 April. e.g. 2026-04-01 -> "2026-27", 2026-03-31 -> "2025-26".
UPDATE "Patient"
SET "financialYear" = CASE
  WHEN EXTRACT(MONTH FROM "entryDate") >= 4 THEN
    EXTRACT(YEAR FROM "entryDate")::int::text
    || '-' ||
    LPAD(((EXTRACT(YEAR FROM "entryDate")::int + 1) % 100)::text, 2, '0')
  ELSE
    (EXTRACT(YEAR FROM "entryDate")::int - 1)::text
    || '-' ||
    LPAD((EXTRACT(YEAR FROM "entryDate")::int % 100)::text, 2, '0')
END
WHERE "financialYear" IS NULL;

-- 3. Backfill registerNumber as a continuous sequence per FY,
--    ordered by entryDate then dailySerial then createdAt for determinism.
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "financialYear"
      ORDER BY "entryDate" ASC, "dailySerial" ASC, "createdAt" ASC
    ) AS rn
  FROM "Patient"
)
UPDATE "Patient" p
SET "registerNumber" = n.rn
FROM numbered n
WHERE p.id = n.id
  AND p."registerNumber" IS DISTINCT FROM n.rn;

-- 4. Lock the columns down.
ALTER TABLE "Patient" ALTER COLUMN "financialYear"  SET NOT NULL;
ALTER TABLE "Patient" ALTER COLUMN "registerNumber" SET NOT NULL;

-- 5. Constraints + indexes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Patient_financialYear_registerNumber_key'
  ) THEN
    ALTER TABLE "Patient"
      ADD CONSTRAINT "Patient_financialYear_registerNumber_key"
      UNIQUE ("financialYear", "registerNumber");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Patient_financialYear_idx" ON "Patient"("financialYear");

COMMIT;
