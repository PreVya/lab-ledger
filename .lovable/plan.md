# Fix: Ask for entry date when converting an appointment to a patient

## Problem (confirmed in code)

In `src/routes/appointments.tsx`, the "Create Patient Entry" button opens the patient form with `entryDate={today}` (line 107) — the system date, not the appointment date. So an appointment for 05-Aug-2026 converted on 08-Aug-2026 creates the patient on 08-Aug.

## New flow

1. Click **Create Patient Entry** → a small dialog opens:
   - Title: "Create Patient Entry"
   - Message: "Select the ledger date for this patient entry."
   - Field: **Entry Date**, defaulting to the appointment's `appointmentDate`
   - Buttons: Cancel / Continue
2. Cancel → nothing happens, no patient form, no patient created.
3. Continue → the Patient Entry form opens with that exact date, and the saved patient uses it.

The date input is limited to 01-Aug-2026 onward and rejects Sundays, matching the existing ledger rules, with an inline message when the chosen date is invalid (Continue stays disabled).

## What stays the same

- Advance/Balance Paid On stay blank; still required only when an amount is entered.
- Appointment linking behaviour unchanged; the button remains hidden for already-linked appointments, so no duplicates.
- No ledger changes: opening/closing cash, Close Day & Carry Forward, Sunday blocking, register numbering, billing all untouched.

## Technical changes

**`src/routes/appointments.tsx`**
- Add local state for the pending appointment and the chosen date.
- New small `EntryDateDialog` (shadcn Dialog + `type="date"` input) with `min=2026-08-01` and a Sunday guard; on Continue it stores the date and opens `PatientFormDialog`.
- Pass `entryDate={chosenDate}` instead of `today`.

**`src/components/patient-form-dialog.tsx`**
- Already forwards `entryDate` to the create call for new patients (line 138) and never overwrites it with today — verify only; no behavioural change expected beyond confirming the prop is honoured on reopen.

**Backend (`backend/src/modules/patients/patients.service.ts`)**
- Currently falls back to `dateOnly()` (today) when `entryDate` is omitted. Add an explicit `fromAppointment` marker on the create DTO/controller: when set and `entryDate` is missing, reject with "Entry date is required for appointment patient entry." Existing `assertLedgerDate` continues to enforce the 01-Aug-2026 start and Sunday block. The plain Today-Register path keeps its today fallback.
