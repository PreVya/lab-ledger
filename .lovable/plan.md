# Payment Model Fix + Payment Editing + Balance Received UI

Three connected fixes, no changes to register numbers, FY, ledger start (01-Aug-2026), opening cash 1020, Close Day, Sunday blocking, appointment conversion, billing, attendance, salary, tests, users, employees, holidays.

## 1. Payment table becomes canonical

Confirmed from the code: the daily ledger already computes cash/UPI/card collections and closing cash from `Payment` rows by payment date, so ledger math does not need redesign. The problem is on the write side.

- `patients.service.update()` currently reconciles the form's four bucket fields against existing payment rows and inserts **negative delta rows** tagged `[form-sync delta]`. That is exactly the source of `Cash ₹-350`. This delta mechanism will be removed.
- Patient create keeps writing at most one advance row and one balance row (the first payments), each with an explicitly chosen date — no auto-fill from today or entry date.
- Patient edit will no longer touch payment rows at all. Amount/mode/date corrections happen in the payment history UI.
- Patient bucket fields (`advanceCash`, `advanceUpi`, `balanceCash`, `balanceUpi`, `advancePaidOn`, `balancePaidOn`) stay only as summary mirrors, recomputed from the payment rows after every payment create/update/delete.
- `Patient.balance` (pending) = `net - SUM(Payment.amount)`.

## 2. Payment CRUD endpoints

- `POST /api/payments` — requires explicit `date`; remove the `dateOnly()` today fallback so a missing date is rejected. Keeps `assertLedgerDate` (>= 01-Aug-2026, not Sunday).
- `PUT /api/payments/:id` — updates date, kind, mode, amount, notes **in place** on the same row. No reversal rows. Recomputes the old date's ledger and the new date's ledger when the date changes, and recomputes patient summary fields.
- `DELETE /api/payments/:id` — hard delete of the row, then recompute that date's ledger and the patient summary.
- Every mutation recomputes the affected patient buckets from the full set of that patient's payment rows.

## 3. Clean up existing bad rows

Negative payment rows already in the database (e.g. Kiran Vishe's `cash -350`) must disappear from normal views:
- Ledger summary, Balance Received, and patient payment history filter out rows with `amount <= 0`, so existing artefacts are hidden immediately without touching the historical data.
- Ledger collection sums keep using all rows so cash totals stay arithmetically correct for legacy pairs; once the user re-edits the row through the new UI, the pair is replaced by a single clean row.
- A one-shot maintenance endpoint `POST /api/payments/cleanup-deltas` collapses legacy `[form-sync delta]` pairs per patient/kind/mode into one net row and deletes zero rows, then recomputes affected ledger dates. Run once from the UI (Ledger repair area).

## 4. Payment history UI on patient detail

New `PaymentsPanel` shown in the patient form dialog for existing patients:
- Summary line: Net Amount / Total Paid / Pending.
- Table: Date | Kind | Mode | Amount | Notes | Actions (Edit, Delete).
- `Add Payment` button opens a dialog: Payment Date (required, >= 2026-08-01, not Sunday), Kind, Mode, Amount > 0, Notes optional. Confirms if total paid would exceed net.
- Edit reuses the same dialog pre-filled and calls `PUT`, so changing Cash to UPI mutates the one row.
- The registration form's advance/balance fields stay as-is for the first payment only, and remain disabled/read-only for editing once payment rows exist (edits go through the panel).

## 5. Balance Received table UI

- Heading becomes `Balance Received on 11-Aug-2026` (selected date), not "Today (from previous days)".
- Columns: Patient | Reg No. | FY | Patient Entry Date | Mode | Amount, with `table-fixed`, explicit column widths, `whitespace-nowrap` header cells, bold header row, right-aligned amount, mode rendered as Cash / UPI / Card.
- Rows with non-positive amounts are excluded.

## Technical notes

Files touched:
- `backend/src/modules/payments/payments.service.ts` — canonical CRUD, `update`, summary recompute helper, no today fallback.
- `backend/src/modules/payments/payments.controller.ts` — `PUT /:id`, cleanup endpoint.
- `backend/src/modules/patients/patients.service.ts` — drop the `[form-sync delta]` block in `update()`.
- `backend/src/modules/ledger/ledger.service.ts` — filter non-positive rows out of the returned `payments` list only.
- `src/lib/api.ts`, `src/lib/queries.ts`, `src/lib/types.ts` — payment list/create/update/delete hooks.
- `src/components/payments-panel.tsx` (new) + `src/components/patient-form-dialog.tsx`.
- `src/routes/index.tsx` — Balance Received table.
- `src/lib/demo-mode.ts` — mirror new endpoints for the offline preview.

No Prisma schema change and no migration: the `Payment` table already has every needed column.

## Acceptance

Four payments (100 advance cash, 200 balance UPI, 300 balance cash, 900 balance cash) on four different dates all persist, total paid 1500, pending 0, each shown on its own ledger date. Editing Kiran Vishe's 350 from Cash to UPI leaves one UPI row, removes 350 from cash collection, adds it to UPI, and shows no negative row anywhere.
