# Finish the Payment Fix — Remaining 6 Steps

The payments backend is already rewritten (payments are the single source of truth, editing a payment changes that same row, no negative correction rows, legacy corrections netted, cleanup endpoint added). What is left is the rest of the app catching up to it.

## What you will get

1. **Patient edit no longer creates correction rows.** Saving a patient edit only touches details, tests and discount — money is never silently adjusted, so the Kiran Vishe "Cash -350" artefact can't reappear.
2. **A Payment Transactions section inside the Patient Entry / Edit window.** A table of Date | Kind | Mode | Amount | Notes with Add, Edit and Delete, plus a summary line showing Net, Total Paid and Pending (or an Overpaid warning). Every date is picked by you — nothing pre-filled.
3. **Ledger views stay clean.** The day's payment list nets out old correction pairs, so only real money shows.
4. **Balance Received table redesigned**: separate bold headings Patient | Reg No. | FY | Patient Entry Date | Mode | Amount, right-aligned amounts, heading reads "Balance Received on 11-Aug-2026".
5. **Offline preview keeps working** — the demo data mirrors the same add/edit/delete payment behaviour and netting.

## Untouched

Register numbering, financial year logic, ledger start 01-Aug-2026, Rs. 1020 opening cash, Close Day & Carry Forward, Sunday blocking, appointment conversion date flow, billing, attendance, salary, test catalogue, users, employees, holidays. No database change.

## Technical detail

1. `backend/src/modules/patients/patients.service.ts` — delete the `[form-sync delta]` block from `update()`; after the update only call `paymentsService.resyncPatient(id)` and recompute the ledger for the existing `entryDate` — `entryDate` itself is never read, recomputed, or modified during update (it changes only through the explicit patient edit flow). `create()` accepts an optional `payments[]` array (each with its own required date): when `payments[]` is provided, Payment rows are created ONLY from it; when absent, it falls back to one Payment row per non-zero advanceCash/advanceUpi/balanceCash/balanceUpi bucket for backward compatibility. The two sources are never combined in the same request.
2. `backend/src/modules/ledger/ledger.service.ts` — run the `payments` array returned by `summary()` through `PaymentsService.netRows()` so legacy positive/negative pairs cancel. Cash closing, close-day and carry-forward formulas unchanged.
3. `src/lib/types.ts` + `src/lib/api.ts` + `src/lib/queries.ts` — add `PaymentHistoryResponse` types and `usePatientPayments`, `useRecordPayment`, `useUpdatePayment`, `useDeletePayment` hooks wired to `GET /payments/history/:id`, `POST /payments`, `PUT /payments/:id`, `DELETE /payments/:id`, invalidating both the patient/day and history keys.
4. `src/components/patient-form-dialog.tsx` — new `PaymentTransactions` sub-component: local rows for a not-yet-saved patient (submitted as `payments[]`), live API rows for an existing patient. Add/Edit dialog with required date, kind, mode, amount, notes; validation for date >= 2026-08-01, non-Sunday, amount > 0; overpaid banner showing the excess. The legacy advance/balance bucket inputs leave the editable flow and become read-only summary text.
5. `src/routes/index.tsx` — rebuild `BalanceReceivedPanel` as a real table with the six columns, bold header row, dated heading, right-aligned amounts, uppercase mode labels.
6. `src/lib/demo-mode.ts` — replace `syncPaymentsFor` with transaction-aware handlers for POST/PUT/DELETE `/payments`, `GET /payments/history/:id` with netting, and patient resync from rows, so the preview matches the real backend.
