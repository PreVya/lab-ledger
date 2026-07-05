-- PHASE 1.92 Migration: Added Cash ledger provision
-- Preferred execution: copy this SQL and run it in Supabase SQL Editor.
-- Optional CLI execution only if Prisma DB connection works:
-- yarn prisma db execute --file ./prisma/migrations/phase_1_92_added_cash_and_shortcut/migration.sql --schema ./prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "CashAdded" (
  "id"          TEXT PRIMARY KEY,
  "date"        DATE NOT NULL,
  "amount"      DECIMAL(10,2) NOT NULL,
  "notes"       TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CashAdded_date_idx"        ON "CashAdded"("date");
CREATE INDEX IF NOT EXISTS "CashAdded_createdById_idx" ON "CashAdded"("createdById");
