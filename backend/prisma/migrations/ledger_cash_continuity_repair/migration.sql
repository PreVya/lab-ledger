-- One-time ledger cash continuity repair (safe, idempotent, data-preserving).
--
-- Re-chains DailyLedger from 01-Aug-2026 onward:
--   opening(first valid day 2026-08-01) = 1020
--   opening(day)   = closing(previous valid ledger day)
--   closing(day)   = opening + cashCollected - cashExpenses - cashTakenAway + addedCash
--
-- Only CASH movements affect the cash balance. No patient/payment/expense rows
-- are deleted or modified. No other table is touched.

-- Remove ledger rows that must not exist (before start date, or Sundays) and
-- that carry no transactions of their own.
DELETE FROM "DailyLedger" dl
WHERE (dl."date" < DATE '2026-08-01' OR EXTRACT(DOW FROM dl."date") = 0)
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."date" = dl."date")
  AND NOT EXISTS (SELECT 1 FROM "Expense" e WHERE e."date" = dl."date")
  AND NOT EXISTS (SELECT 1 FROM "CashHandover" h WHERE h."date" = dl."date")
  AND NOT EXISTS (SELECT 1 FROM "CashAdded" c WHERE c."date" = dl."date")
  AND NOT EXISTS (SELECT 1 FROM "Patient" pa WHERE pa."entryDate" = dl."date");

-- Make sure the anchor day exists with the seeded opening cash.
INSERT INTO "DailyLedger" ("id", "date", "openingBalance", "closingBalance", "updatedAt")
SELECT gen_random_uuid()::text, DATE '2026-08-01', 1020, 1020, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "DailyLedger" WHERE "date" = DATE '2026-08-01');

DO $$
DECLARE
  r RECORD;
  running NUMERIC;
  delta NUMERIC;
BEGIN
  running := 1020;  -- opening cash on 2026-08-01

  FOR r IN
    SELECT "id", "date"
    FROM "DailyLedger"
    WHERE "date" >= DATE '2026-08-01'
      AND EXTRACT(DOW FROM "date") <> 0
    ORDER BY "date" ASC
  LOOP
    delta :=
        COALESCE((SELECT SUM(p."amount") FROM "Payment" p
                  WHERE p."date" = r."date" AND p."mode" = 'cash'), 0)
      - COALESCE((SELECT SUM(e."amount") FROM "Expense" e
                  WHERE e."date" = r."date" AND e."mode" = 'cash'), 0)
      - COALESCE((SELECT SUM(h."amount") FROM "CashHandover" h
                  WHERE h."date" = r."date"), 0)
      + COALESCE((SELECT SUM(c."amount") FROM "CashAdded" c
                  WHERE c."date" = r."date"), 0);

    UPDATE "DailyLedger"
    SET "openingBalance" = running,
        "closingBalance" = running + delta,
        "updatedAt" = NOW()
    WHERE "id" = r."id";

    running := running + delta;
  END LOOP;
END $$;
