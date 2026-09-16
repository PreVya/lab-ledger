-- Phase 4 — Tea / Coffee module
-- Idempotent & additive. Touches NO existing table, and never writes
-- DailyLedger.openingBalance / closingBalance / closedAt.

DO $$ BEGIN
  CREATE TYPE "TeaCoffeeItem" AS ENUM ('tea', 'coffee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TeaCoffeeBillStatus" AS ENUM ('unpaid', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TeaCoffeeRate" (
    "id" TEXT NOT NULL,
    "item" "TeaCoffeeItem" NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeaCoffeeRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeaCoffeeRate_item_key" ON "TeaCoffeeRate"("item");

CREATE TABLE IF NOT EXISTS "TeaCoffeeEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "employeeId" TEXT NOT NULL,
    "item" "TeaCoffeeItem" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "rateAtTime" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeaCoffeeEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TeaCoffeeEntry_date_idx" ON "TeaCoffeeEntry"("date");
CREATE INDEX IF NOT EXISTS "TeaCoffeeEntry_employeeId_idx" ON "TeaCoffeeEntry"("employeeId");

DO $$ BEGIN
  ALTER TABLE "TeaCoffeeEntry"
    ADD CONSTRAINT "TeaCoffeeEntry_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TeaCoffeeMonthlyBill" (
    "id" TEXT NOT NULL,
    "billMonth" TEXT NOT NULL,
    "teaCount" INTEGER NOT NULL DEFAULT 0,
    "coffeeCount" INTEGER NOT NULL DEFAULT 0,
    "teaAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "coffeeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "TeaCoffeeBillStatus" NOT NULL DEFAULT 'unpaid',
    "paidDate" DATE,
    "paidAmount" DECIMAL(10,2),
    "expenseId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeaCoffeeMonthlyBill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeaCoffeeMonthlyBill_billMonth_key" ON "TeaCoffeeMonthlyBill"("billMonth");
CREATE UNIQUE INDEX IF NOT EXISTS "TeaCoffeeMonthlyBill_expenseId_key" ON "TeaCoffeeMonthlyBill"("expenseId");

-- Seed default rates: tea Rs. 10, coffee Rs. 20 (only when missing).
INSERT INTO "TeaCoffeeRate" ("id", "item", "rate", "active", "effectiveFrom", "updatedAt")
SELECT gen_random_uuid()::text, 'tea', 10.00, true, DATE '2026-08-01', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "TeaCoffeeRate" WHERE "item" = 'tea');

INSERT INTO "TeaCoffeeRate" ("id", "item", "rate", "active", "effectiveFrom", "updatedAt")
SELECT gen_random_uuid()::text, 'coffee', 20.00, true, DATE '2026-08-01', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "TeaCoffeeRate" WHERE "item" = 'coffee');
