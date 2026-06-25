-- Phase 1.5 fix — backfill Payment audit log from existing Patient buckets.
--
-- Reason: ledger collection is now summed from "Payment" by actual payment date.
-- For patients created before the Payment table existed (or via patients.create
-- before this fix), buckets had no matching Payment row, so historical day
-- ledgers showed zero collection. This migration inserts one Payment row per
-- non-zero bucket, dated:
--   - advancePaidOn (or entryDate if null) for advance buckets
--   - balancePaidOn (or entryDate if null) for balance buckets
-- It is idempotent: it only inserts when no existing matching Payment row
-- for that (patientId, kind, mode) exists.

BEGIN;

INSERT INTO "Payment" (id, "patientId", date, kind, mode, amount, "createdAt", notes)
SELECT gen_random_uuid(), p.id,
       COALESCE(p."advancePaidOn"::date, p."entryDate"),
       'advance'::"PaymentKind", 'cash'::"PaymentMode",
       p."advanceCash", now(), '[backfill]'
FROM "Patient" p
WHERE p."advanceCash" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" x
    WHERE x."patientId" = p.id AND x.kind = 'advance' AND x.mode = 'cash'
  );

INSERT INTO "Payment" (id, "patientId", date, kind, mode, amount, "createdAt", notes)
SELECT gen_random_uuid(), p.id,
       COALESCE(p."advancePaidOn"::date, p."entryDate"),
       'advance'::"PaymentKind", 'upi'::"PaymentMode",
       p."advanceUpi", now(), '[backfill]'
FROM "Patient" p
WHERE p."advanceUpi" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" x
    WHERE x."patientId" = p.id AND x.kind = 'advance' AND x.mode = 'upi'
  );

INSERT INTO "Payment" (id, "patientId", date, kind, mode, amount, "createdAt", notes)
SELECT gen_random_uuid(), p.id,
       COALESCE(p."balancePaidOn"::date, p."entryDate"),
       'balance'::"PaymentKind", 'cash'::"PaymentMode",
       p."balanceCash", now(), '[backfill]'
FROM "Patient" p
WHERE p."balanceCash" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" x
    WHERE x."patientId" = p.id AND x.kind = 'balance' AND x.mode = 'cash'
  );

INSERT INTO "Payment" (id, "patientId", date, kind, mode, amount, "createdAt", notes)
SELECT gen_random_uuid(), p.id,
       COALESCE(p."balancePaidOn"::date, p."entryDate"),
       'balance'::"PaymentKind", 'upi'::"PaymentMode",
       p."balanceUpi", now(), '[backfill]'
FROM "Patient" p
WHERE p."balanceUpi" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" x
    WHERE x."patientId" = p.id AND x.kind = 'balance' AND x.mode = 'upi'
  );

-- Force ledger closing balances to be recomputed lazily on next /ledger read.
UPDATE "DailyLedger" SET "closingBalance" = "openingBalance";

COMMIT;
