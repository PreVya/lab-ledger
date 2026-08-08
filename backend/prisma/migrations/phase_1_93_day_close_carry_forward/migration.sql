-- Day Close & Carry Forward (replaces the automatic opening-balance cascade).
--
-- Rule:
--   opening(2026-08-01) = 1020 (seeded)
--   opening(day)        = closing(previous ledger day) ONLY IF that day is CLOSED
--                         (Cash Taken Away recorded, or "Close Day & Carry Forward")
--                       = 0 otherwise
--   closing(day)        = opening + cashCollected - cashExpenses - cashTakenAway + addedCash
--
-- Idempotent and data-preserving. No patient/payment/expense row is touched.

ALTER TABLE "DailyLedger" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Backfill: any day that already has a Cash Taken Away entry counts as closed.
UPDATE "DailyLedger" dl
SET "closedAt" = NOW()
WHERE dl."closedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "CashHandover" h WHERE h."date" = dl."date");

-- Re-chain balances under the new rule.
DO $$
DECLARE
  r RECORD;
  carry NUMERIC;      -- cash available to carry into the next day (NULL = not closed)
  opening NUMERIC;
  delta NUMERIC;
BEGIN
  carry := NULL;

  FOR r IN
    SELECT "id", "date", "closedAt"
    FROM "DailyLedger"
    WHERE "date" >= DATE '2026-08-01'
      AND EXTRACT(DOW FROM "date") <> 0
    ORDER BY "date" ASC
  LOOP
    IF r."date" = DATE '2026-08-01' THEN
      opening := 1020;
    ELSE
      opening := COALESCE(carry, 0);
    END IF;

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
    SET "openingBalance" = opening,
        "closingBalance" = opening + delta,
        "updatedAt" = NOW()
    WHERE "id" = r."id";

    IF r."closedAt" IS NOT NULL THEN
      carry := opening + delta;
    ELSE
      carry := NULL;   -- open day: nothing carries forward
    END IF;
  END LOOP;
END $$;
