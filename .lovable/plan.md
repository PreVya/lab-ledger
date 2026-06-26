# Phase 1.75 — Reception Book Alignment

Scope is large and touches schema + backend + frontend. Plan first, then execute as one batch of migrations + code changes. No destructive resets; everything ships as a single idempotent SQL file plus matching Prisma schema + service/UI updates.

Constraints (locked in):
- Keep Patient/Test/Payment UUID PKs.
- Keep FY + registerNumber logic untouched.
- Keep Patient bucket fields (advance/balance × cash/upi + paidOn).
- `Patient.entryDate` = registration day; `Payment.date` = money-received day.
- Ledger patient list filters by `entryDate`; ledger collection totals come from `Payment`.
- All schema changes ship as a single SQL file runnable in Supabase SQL Editor (idempotent).

---

## 1. Schema changes (Prisma + SQL migration)

File: `backend/prisma/migrations/phase_1_75_reception_book_alignment/migration.sql`

- `TestCatalog`
  - Drop `UNIQUE(name)`.
  - Add functional unique index on `(lower(trim(name)), coalesce(lower(trim("outsourcedLab")), 'INHOUSE'))`.
- `Patient`
  - Add `ageValue INT NULL`, `ageUnit` text/enum (`days|months|years`) default `years`.
  - Backfill `ageValue := age`, `ageUnit := 'years'`.
  - Keep legacy `age` column (Prisma still maps it; new writes also set it = `ageValue` when unit=years, else 0, for back-compat).
  - Backfill `createdById` for NULL rows → seeded `admin` user id (lookup by username). Then `SET NOT NULL` only if no NULL remains.
- `Expense`
  - `mode` already exists (cash|upi). Extend enum to add `card` and `other`. Done via `ALTER TYPE PaymentMode ADD VALUE IF NOT EXISTS ...`.
- `PaymentMode` enum → add `card`.
- `CashHandover` (new table)
  - `id uuid pk`, `date date`, `amount numeric(10,2)`, `notes text null`, `createdById uuid null`, `createdAt`, `updatedAt`.
  - Indexes: `(date)`.
  - GRANTs to `authenticated`, `service_role` (note: backend uses Prisma w/ service creds, but keep grants for consistency).
- Indexes (idempotent `CREATE INDEX IF NOT EXISTS`):
  - `Payment(date)`, `Payment(patientId)`, `Payment(kind, date)`
  - `Patient(entryDate)` (already exists, guard)
  - `Expense(date)` (already exists, guard)
  - `CashHandover(date)`
- DailyLedger: do NOT add cash-specific columns yet. Compute cash opening/closing on-the-fly from prior days' Payment+Expense+CashHandover. Persist computed `closingBalance` (now cash-only semantics) for fast "previous day" lookup. Document in code that `openingBalance/closingBalance` now mean CASH.

## 2. Prisma schema

Update `backend/prisma/schema.prisma` to mirror SQL: `Patient.ageValue`, `ageUnit`, `CashHandover` model, `PaymentMode` + `Expense.mode` extended, remove `@unique` from `TestCatalog.name`. Add `@@index` matching SQL.

## 3. Backend services

- `tests.service.ts`: accept duplicate names with different providers; rely on DB unique for exact-dup prevention; return friendly error on `P2002`.
- `patients.service.ts`:
  - Accept `ageValue`, `ageUnit` (default `years`). Mirror to legacy `age` (years value or 0).
  - Use `CurrentUser` from controller → set `createdById` on create; ignore any client-supplied value.
  - On update, do NOT overwrite `createdById`.
- `patients.controller.ts`: inject `@CurrentUser()`, pass `user.sub` into service.
- New `cash-handover` module: controller + service.
  - `POST /cash-handover` (auth required, sets `createdById`).
  - `GET /cash-handover?date=YYYY-MM-DD`.
  - `DELETE /cash-handover/:id` (admin only — reuse `RolesGuard`).
- `ledger.service.ts` `summary(date)`:
  - Add parallel fetches for `cashHandover` rows + payments grouped by mode.
  - Compute split totals: `cashCollected`, `upiCollected`, `cardCollected`, `totalCollected`.
  - Compute `cashExpenses` (Expense.mode='cash') vs total expenses.
  - `cashTakenAway = sum(CashHandover.amount where date=day)`.
  - `openingCashBalance` = previous day's persisted `closingBalance` (cash-only) or 0.
  - `closingCashBalance = opening + cashCollected - cashExpenses - cashTakenAway`.
  - Persist closing in background as before.
  - Return new fields plus existing structure (back-compat). Include `balancePaymentsToday` = `payments` filtered to `kind='balance'` (already returned in `payments` array; UI will filter).
- `payments.service.ts`: keep mirroring to buckets; allow `mode='card'` (extend validator).
- `expenses.service.ts`: pass-through for new modes; ensure DTO validation includes `card|other`.

Recompute helper (`ledger.recompute`) updated for same cash math.

## 4. Frontend

- `src/lib/types.ts`: add `ageValue`, `ageUnit`, `CashHandover`, new ledger summary fields (`cashCollected`, `upiCollected`, `cardCollected`, `cashTakenAway`, `openingCashBalance`, `closingCashBalance`).
- `src/lib/queries.ts`: add `useCashHandovers(date)`, `useCreateCashHandover`, optimistic patches.
- `src/components/patient-form-dialog.tsx`:
  - Replace single age input with `ageValue` + `ageUnit` select.
  - Test selector rows show `Name — Provider/In-house — ₹rate`.
- `src/routes/tests.tsx`: form supports duplicate name + provider distinction; list shows provider + rate columns.
- `src/routes/index.tsx` ledger:
  - Replace 6-stat row with split cards: Opening Cash, Cash Coll, UPI Coll, Card Coll, Total Coll, Cash Expenses, Cash Taken Away, Closing Cash, Pending Balance, Patients count.
  - New right-rail / lower section: "Balance Received Today" list (from `payments` where `kind=balance`, join patient summary). Shows patient name, reg#, FY, original entryDate, amount, mode.
  - New "Cash Taken Away" panel with quick-add form + list (amount, notes, by, time, delete if admin).
  - Patient table: age column renders `{ageValue} {ageUnit}`.

## 5. Acceptance smoke

After build, manually verify in preview using demo mode shims (extend `src/lib/demo-mode.ts` minimally to cover new endpoints so the in-browser preview keeps working without the NestJS backend):
- duplicate test name w/ different lab allowed; exact dup blocked.
- newborn 2 days renders as "2 days".
- cash handover reduces closing cash; UPI does not.
- balance paid today shows in Balance Received section and lifts today's cash total but not yesterday's.

## 6. Out of scope (explicit)

- No invoice/print changes.
- No reports/export endpoints (foundation only).
- No role-gated edit/delete UI for CashHandover beyond a basic delete button (admin role check on backend).
- No Phase 2 appointment work.

## Open question

None — every ambiguous point in the spec has a chosen default above. If you want different defaults (e.g., add cash-specific `openingCashBalance` columns rather than reusing `openingBalance`), say so before I start; otherwise I'll proceed exactly as planned.
