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

`**src/routes/appointments.tsx**`

- Add local state for the pending appointment and the chosen date.
- New small `EntryDateDialog` (shadcn Dialog + `type="date"` input) with `min=2026-08-01` and a Sunday guard; on Continue it stores the date and opens `PatientFormDialog`.
- Pass `entryDate={chosenDate}` instead of `today`.

`**src/components/patient-form-dialog.tsx**`

- Already forwards `entryDate` to the create call for new patients (line 138) and never overwrites it with today — verify only; no behavioural change expected beyond confirming the prop is honoured on reopen.

**Backend (`backend/src/modules/patients/patients.service.ts`)**

- Currently falls back to `dateOnly()` (today) when `entryDate` is omitted. Add an explicit `fromAppointment` marker on the create DTO/controller: when set and `entryDate` is missing, reject with "Entry date is required for appointment patient entry." Existing `assertLedgerDate` continues to enforce the 01-Aug-2026 start and Sunday block. The plain Today-Register path keeps its today fallback.  
  
CORRECTION TO APPOINTMENT ENTRY DATE FIX — REMOVE SILENT TODAY FALLBACK FOR PATIENT CREATE
  The proposed appointment date dialog flow is good.
  But there is one dangerous issue in the proposed backend change:
  It says:
  "Plain Today-Register path keeps its today fallback."
  Do NOT keep silent backend fallback to today for patient creation.
  That fallback is exactly the type of hidden behavior that caused wrong patient entry dates.
  For this app, Patient.entryDate must always be explicitly provided by frontend.
  ────────────────────────────
  1. Backend rule
  ────────────────────────────
  In backend patient creation:
  - entryDate is required.
  - If entryDate is missing, reject the request.
  - Do NOT default entryDate to today.
  - Do NOT use system date silently.
  - Do NOT use dateOnly() fallback for patient creation.
  Error:
  "Patient entry date is required."
  This should apply to all patient create flows:
  - Today Register
  - selected historical ledger date
  - appointment conversion
  - any future patient entry flow
  ────────────────────────────
  2. Frontend rule
  ────────────────────────────
  Frontend must always send entryDate explicitly.
  A. Today/Register ledger page:
  - send currently selected ledger date
  B. Historical ledger page:
  - send selected historical ledger date
  C. Appointment conversion:
  - open Entry Date dialog
  - default date = appointment.appointmentDate
  - user confirms/selects date
  - send that selected date as entryDate
  D. Any other future patient creation:
  - must provide entryDate explicitly
  ────────────────────────────
  3. Appointment conversion flow remains
  ────────────────────────────
  Keep the new appointment conversion flow:
  Click Create Patient Entry
  → Entry Date dialog opens
  → default = appointment.appointmentDate
  → user can change date
  → Continue
  → PatientFormDialog opens with selected date
  → saved Patient.entryDate = selected date
  Do not use today.
  ────────────────────────────
  4. fromAppointment marker is optional, not sufficient
  ────────────────────────────
  Do not depend only on fromAppointment marker.
  Even if fromAppointment is not passed, backend should still reject missing entryDate.
  The main rule is simple:
  No entryDate = no patient creation.
  If fromAppointment marker is added, okay, but it should not be the only protection.
  ────────────────────────────
  5. PatientFormDialog must respect entryDate prop
  ────────────────────────────
  PatientFormDialog must:
  - use the entryDate prop passed to it
  - not overwrite it with today
  - reset correctly when opening for a different appointment/date
  - send entryDate in the create API payload
  If dialog is reopened for another appointment:
  - previous chosen date should not leak
  - new selected date should be used
  ────────────────────────────
  6. Validation
  ────────────────────────────
  Backend should validate entryDate using existing ledger rules:
  - entryDate >= 2026-08-01
  - not Sunday/blocked holiday if that rule exists
  - not before official ledger start date
  ────────────────────────────
  7. Acceptance tests
  ────────────────────────────
  A. Missing entryDate backend test
  - Call patient create API without entryDate.
  - Backend must reject.
  - It must not create patient with today’s date.
  B. Ledger page patient creation
  - Open ledger date 2026-08-05.
  - Add patient.
  - Payload contains entryDate = 2026-08-05.
  - Patient is saved with entryDate = 2026-08-05.
  C. Appointment conversion
  - Today is 2026-08-08.
  - Appointment date is 2026-08-05.
  - Click Create Patient Entry.
  - Dialog defaults to 2026-08-05.
  - Continue.
  - PatientFormDialog opens with 2026-08-05.
  - Saved Patient.entryDate = 2026-08-05.
  - It must not become 2026-08-08.
  D. User changes date
  - Appointment date is 2026-08-05.
  - User selects 2026-08-06 in dialog.
  - Saved Patient.entryDate = 2026-08-06.
  E. Payment dates untouched
  - Advance Paid On remains blank unless user selects it.
  - Balance Paid On remains blank unless user selects it.
  Final instruction:
  Remove silent backend fallback to today for patient creation.
  Patient.entryDate must always be explicitly sent and validated.
  Do not touch ledger logic.