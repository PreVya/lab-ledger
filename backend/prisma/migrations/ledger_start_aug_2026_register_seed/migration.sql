-- Ledger start lock (01-Aug-2026) + FY 2026-27 register seed.
--
-- Safe for the Supabase SQL editor. This migration NEVER deletes, truncates or
-- modifies any non-ledger table (User, TestCatalog, Employee, Attendance,
-- SalaryAdvance, Holiday, Appointment, StoredFile are untouched).
--
-- 1) Seed the opening cash balance for the official first ledger day.
--    Idempotent: inserts only if the row is missing, otherwise refreshes the
--    opening balance while keeping the existing row/id.
-- 2) Remove any stray DailyLedger rows before the start date ONLY if they are
--    empty shells (no payments/expenses/handovers/added-cash on that date).

INSERT INTO "DailyLedger" ("id", "date", "openingBalance", "closingBalance", "updatedAt")
SELECT gen_random_uuid()::text, DATE '2026-08-01', 1020, 1020, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "DailyLedger" WHERE "date" = DATE '2026-08-01');

UPDATE "DailyLedger"
SET "openingBalance" = 1020,
    "closingBalance" = GREATEST("closingBalance", 0) + (1020 - "openingBalance"),
    "updatedAt" = NOW()
WHERE "date" = DATE '2026-08-01'
  AND "openingBalance" <> 1020;

DELETE FROM "DailyLedger" dl
WHERE dl."date" < DATE '2026-08-01'
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."date" = dl."date")
  AND NOT EXISTS (SELECT 1 FROM "Expense" e WHERE e."date" = dl."date")
  AND NOT EXISTS (SELECT 1 FROM "CashHandover" h WHERE h."date" = dl."date")
  AND NOT EXISTS (SELECT 1 FROM "CashAdded" c WHERE c."date" = dl."date")
  AND NOT EXISTS (SELECT 1 FROM "Patient" pa WHERE pa."entryDate" = dl."date");
