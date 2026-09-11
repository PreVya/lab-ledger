-- Phase 1.95 — manual patient tracking flags.
-- Safe / idempotent. No data backfill required (defaults cover existing rows).

BEGIN;

ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "whatsappReportRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "outsourcedReportReady" BOOLEAN NOT NULL DEFAULT false;

COMMIT;
