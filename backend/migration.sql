-- yarn run v1.22.22
-- $ C:\Users\Prerana\DocsProjects\Pratham\lab-ledger\backend\node_modules\.bin\prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'receptionist', 'technician', 'doctor');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('M', 'F', 'O');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('cash', 'upi');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('advance', 'balance');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "outsourced" BOOLEAN NOT NULL DEFAULT false,
    "outsourcedLab" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "dailySerial" INTEGER NOT NULL,
    "entryDate" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "sex" "Sex" NOT NULL,
    "referredDoctor" TEXT,
    "notes" TEXT,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "advanceCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "advanceUpi" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "advancePaidOn" TIMESTAMP(3),
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balanceCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balanceUpi" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balancePaidOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientTest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "rateAtEntry" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PatientTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLedger" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "openingBalance" DECIMAL(12,2) NOT NULL,
    "closingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'cash',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "TestCatalog_name_key" ON "TestCatalog"("name");

-- CreateIndex
CREATE INDEX "Patient_mobile_idx" ON "Patient"("mobile");

-- CreateIndex
CREATE INDEX "Patient_name_idx" ON "Patient"("name");

-- CreateIndex
CREATE INDEX "Patient_entryDate_idx" ON "Patient"("entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_entryDate_dailySerial_key" ON "Patient"("entryDate", "dailySerial");

-- CreateIndex
CREATE INDEX "PatientTest_patientId_idx" ON "PatientTest"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLedger_date_key" ON "DailyLedger"("date");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Payment_patientId_idx" ON "Payment"("patientId");

-- CreateIndex
CREATE INDEX "Payment_date_idx" ON "Payment"("date");

-- AddForeignKey
ALTER TABLE "PatientTest" ADD CONSTRAINT "PatientTest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTest" ADD CONSTRAINT "PatientTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "TestCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

Done in 1.20s.
