-- Phase 2.1 — alwaysPresent employee flag + Holiday table
-- Idempotent: safe to run multiple times.

ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "alwaysPresent" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "Holiday" (
  "id" TEXT PRIMARY KEY,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'custom',
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_date_key" ON "Holiday"("date");
CREATE INDEX IF NOT EXISTS "Holiday_type_idx" ON "Holiday"("type");
