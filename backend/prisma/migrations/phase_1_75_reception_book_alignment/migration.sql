-- Phase 1.75 — Reception Book Alignment
-- Run this once in Supabase SQL Editor. Idempotent and safe to re-run.
-- Covers:
--   1. TestCatalog: allow duplicate name across providers, unique only on
--      normalized (name, provider) — provider=NULL treated as 'INHOUSE'.
--   2. Patient: ageValue/ageUnit (new), backfill from age=years.
--   3. Patient.createdById: backfill NULLs to seeded `admin` user.
--   4. PaymentMode enum: add `card`.
--   5. CashHandover table + indexes + grants.
--   6. Performance indexes on Payment / Expense / Patient / CashHandover.

BEGIN;

-- 1. TestCatalog: drop strict UNIQUE(name), add functional unique over
--    (lower(trim(name)), coalesce(lower(trim(outsourcedLab)), 'INHOUSE')).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public."TestCatalog"'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%(name)%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public."TestCatalog" DROP CONSTRAINT %I', cname);
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Drop the prisma-managed unique index if it still exists by name.
DROP INDEX IF EXISTS public."TestCatalog_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "TestCatalog_name_provider_uniq"
  ON public."TestCatalog" (
    lower(btrim(name)),
    COALESCE(lower(btrim("outsourcedLab")), 'INHOUSE')
  );

-- 2. Patient: ageValue + ageUnit.
ALTER TABLE public."Patient"
  ADD COLUMN IF NOT EXISTS "ageValue" integer,
  ADD COLUMN IF NOT EXISTS "ageUnit" text NOT NULL DEFAULT 'years';

UPDATE public."Patient"
  SET "ageValue" = COALESCE("ageValue", "age")
  WHERE "ageValue" IS NULL;

-- ageUnit constrained to a known set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."Patient"'::regclass AND conname = 'Patient_ageUnit_check'
  ) THEN
    ALTER TABLE public."Patient"
      ADD CONSTRAINT "Patient_ageUnit_check"
      CHECK ("ageUnit" IN ('days', 'months', 'years'));
  END IF;
END $$;

-- 3. Patient.createdById backfill to seeded admin (if present) then NOT NULL.
DO $$
DECLARE
  admin_id text;
BEGIN
  SELECT id INTO admin_id FROM public."User" WHERE username = 'admin' LIMIT 1;
  IF admin_id IS NOT NULL THEN
    UPDATE public."Patient"
      SET "createdById" = admin_id
      WHERE "createdById" IS NULL;
  END IF;
END $$;

-- Only enforce NOT NULL if no NULL rows remain (don't break a fresh DB).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."Patient" WHERE "createdById" IS NULL) THEN
    ALTER TABLE public."Patient" ALTER COLUMN "createdById" SET NOT NULL;
  END IF;
END $$;

-- 4. PaymentMode enum: add `card` (idempotent).
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'card';
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'other';

-- 5. CashHandover table.
CREATE TABLE IF NOT EXISTS public."CashHandover" (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date         date NOT NULL,
  amount       numeric(10,2) NOT NULL,
  notes        text,
  "createdById" text,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "CashHandover_date_idx" ON public."CashHandover" (date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public."CashHandover" TO authenticated;
GRANT ALL ON public."CashHandover" TO service_role;

-- 6. Performance indexes (idempotent).
CREATE INDEX IF NOT EXISTS "Payment_date_idx"        ON public."Payment" (date);
CREATE INDEX IF NOT EXISTS "Payment_patientId_idx"   ON public."Payment" ("patientId");
CREATE INDEX IF NOT EXISTS "Payment_kind_date_idx"   ON public."Payment" (kind, date);
CREATE INDEX IF NOT EXISTS "Patient_entryDate_idx"   ON public."Patient" ("entryDate");
CREATE INDEX IF NOT EXISTS "Expense_date_idx"        ON public."Expense" (date);

COMMIT;
