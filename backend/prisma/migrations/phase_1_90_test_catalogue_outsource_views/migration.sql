-- PHASE 1.90 Migration: Test catalogue outsourced lab views + nullable testCode
-- Preferred execution: copy this SQL and run it in Supabase SQL Editor.
-- Optional CLI execution only if Prisma DB connection works:
-- yarn prisma db execute --file ./prisma/migrations/phase_1_90_test_catalogue_outsource_views/migration.sql --schema ./prisma/schema.prisma

-- 1. Add nullable testCode column (applies to outsourced tests only in the app layer).
ALTER TABLE "TestCatalog"
  ADD COLUMN IF NOT EXISTS "testCode" VARCHAR(100);

-- 2. Add non-unique index for search performance on testCode.
CREATE INDEX IF NOT EXISTS "TestCatalog_testCode_idx"
  ON "TestCatalog" ("testCode");

-- Note: existing rows keep testCode = NULL. No backfill performed.
