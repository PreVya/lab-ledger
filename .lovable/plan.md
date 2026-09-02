# Payment Model Fix — Transactions, Editing, Clean Views

Make the Payment table the single source of truth for money received and kept by the lab. No refunds, no negative rows, no auto-filled dates.

## What changes for you

1. **Multiple payments per patient.** A patient can be paid in any number of instalments, on any dates, in any modes (cash / UPI / card). Nothing is collapsed into a single "balance paid on" date.
2. **Payment Transactions section inside the Patient Entry / Edit window.** A real table (Date | Kind | Mode | Amount | Notes | Actions) with Add / Edit / Delete, plus a summary line: Net Amount, Total Paid, Pending (or Overpaid warning). Every row's date is chosen by you — never pre-filled.
3. **Editing a payment updates that same row.** Changing Cash to UPI just changes the mode. No `-350` correction row is ever created again.
4. **Old correction artefacts disappear from normal views.** Legacy rows are netted per patient + date + kind + mode; only groups with a positive net show. So `Cash +350 / Cash -350 / UPI +350` displays as UPI 350 only.
5. **Balance Received table redesigned** with proper separate headings: Patient | Reg No. | FY | Patient Entry Date | Mode | Amount, bold header, right-aligned amounts, heading reads "Balance Received on 11-Aug-2026".
6. **Overpayment is warned, not refunded.** If the entered amounts exceed the net, a warning shows the excess and you reduce the amount before saving. Cash handed back is simply never recorded.

## Untouched

Register numbering, FY logic, ledger start 01-Aug-2026, Rs. 1020 opening cash, Close Day & Carry Forward, Sunday blocking, appointment conversion date flow, billing, attendance, salary, test catalogue, users, employees, holidays. No database schema change or migration.

## Technical detail

**Backend — `payments.service.ts` (canonical)**
- `record`: require an explicit `date` (remove the `dateOnly()` fallback → 400 if absent), `kind`, `mode`, `amount > 0`; validate with `assertLedgerDate`.
- New `update(id, dto)`: mutate the same row in place (date/kind/mode/amount/notes). No reversal rows. Recompute the old date and the new date when the date moves.
- `remove`: unchanged behaviour, but summaries now rebuilt from rows.
- New private `resyncPatient(patientId)`: recompute `advanceCash/advanceUpi/balanceCash/balanceUpi`, `advancePaidOn/balancePaidOn` (latest date per kind), and `balance = net - SUM(amount)` purely from Payment rows. Called after every create/update/delete. Removes the current incremental `.plus()` mirroring.
- New `history(patientId)`: returns netted groups (`patientId+date+kind+mode`, keep only net > 0) plus net/totalPaid/pending.
- `POST /payments/cleanup-deltas`: deletes rows whose `notes = '[form-sync delta]'` together with the matching positive row they cancel (only when the group nets to zero or when the delta is negative), then resyncs affected patients and recomputes affected ledger dates. Genuine instalments on distinct dates/modes are never merged.

**Backend — `patients.service.ts`**
- `create`: one Payment row per non-zero component (advanceCash, advanceUpi, balanceCash, balanceUpi) — already the case — plus accept an optional `payments[]` array from the form, each with its own required date.
- `update`: delete the `[form-sync delta]` block entirely. Patient edit touches demographics/tests/discount only; money is edited through the payments endpoints. After edit, resync the patient summary from rows and recompute affected ledger dates.

**Backend — `ledger.service.ts`**
- `summary()` already derives collections from Payment rows; add net-grouping so legacy negative/positive pairs cancel in the `payments` array returned to the UI. Cash closing formula, close-day and carry-forward logic unchanged.

**Frontend**
- `patient-form-dialog.tsx`: new `PaymentTransactions` sub-component (local rows for a new patient, live API-backed rows for an existing one), Add/Edit dialog with required date, kind, mode, amount, notes; validation for date ≥ 2026-08-01, non-Sunday, amount > 0; overpaid warning banner. Legacy quick fields removed from the editable flow.
- `routes/index.tsx`: rebuild `BalanceReceivedPanel` with the specified columns, bold header row, date in the heading, right-aligned amounts, uppercase mode labels.
- `queries.ts` / `api.ts` / `types.ts`: add `useUpdatePayment`, `useDeletePayment`, `usePatientPayments`, and payment-history types.
- `demo-mode.ts`: mirror the new POST/PUT/DELETE payment endpoints and netted history so the offline preview keeps working.
