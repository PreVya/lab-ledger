# Phase 2 — Appointments + Attendance + Salary + Aadhaar Storage

Two new modules, both accessible to every logged-in user. Only User Management stays admin-only. No changes to existing ledger / patient / payment / FY / cash handover / added cash / historical entry logic.

## Env vars you will need to set (backend/.env)

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_EMPLOYEE_BUCKET=employee-documents
```

Service role key stays server-side only. Frontend never sees it.

You will need to manually create the private bucket `employee-documents` in Supabase Storage (Storage → New bucket → Private).

---

## Part A — Appointments

### Data model (new tables)

- `Appointment`
  - `id` (uuid), `name`, `mobile`, `ageValue`, `ageUnit`, `sex`
  - `referredDoctor?`, `procedure` (free text — e.g. FNAC, Pap smear)
  - `appointmentDate` (date), `appointmentTime` (string HH:mm)
  - `status` enum: `scheduled | sample_collected | cancelled | rescheduled | no_show`
  - `notes?`, `linkedPatientId?` (FK Patient, nullable)
  - `createdById?`, timestamps
  - Indexes on `appointmentDate`, `status`, `linkedPatientId`

No automatic patient creation, no register number assignment, no ledger impact — ever. Status changes never fabricate rows.

### Backend

New `appointments` module (controller + service):

- `POST /appointments` create
- `GET /appointments?date=YYYY-MM-DD&status=&q=` list/filter
- `GET /appointments/:id`
- `PATCH /appointments/:id` update / reschedule / status change
- `DELETE /appointments/:id`
- `POST /appointments/:id/link-patient` body `{ patientId }` — sets `linkedPatientId` + status `sample_collected`. Rejects if already linked.

All authenticated users (no admin-only guard).

### Frontend

- New top-nav item **Appointments** (route `/appointments`).
- Date picker + status filter + text search (name/mobile/procedure/doctor).
- List/table of appointments for selected date with status pill and action buttons: Edit, Reschedule, Cancel, Mark No-Show, **Create Patient Entry**.
- Create/Edit dialog form.
- **Create Patient Entry** button:
  - Hidden if `linkedPatientId` already set.
  - Opens existing `PatientFormDialog` prefilled with appointment fields (`entryDate` defaults to today or selected collection date).
  - On successful patient create → calls `link-patient`, updates appointment status to `sample_collected`.

---

## Part B — Employees + Attendance + Salary + Aadhaar

### Data model (new tables)

- `StoredFile` (generic file registry — future-proof)
  - `id`, `bucket`, `path`, `originalName`, `mimeType`, `size` (int)
  - `documentType` (e.g. `aadhaar`), `entityType` (e.g. `employee`), `entityId`
  - `uploadedById?`, `createdAt`
  - Indexes on `(entityType, entityId)`
- `Employee`
  - `id`, `name`, `mobile?`, `designation?`
  - `monthlySalary` (Decimal 10,2)
  - `active` (bool default true)
  - `linkedUserId?` (FK User, nullable)
  - `aadhaarDocumentId?` (FK StoredFile, nullable)
  - timestamps
  - Index on `active`
- `Attendance`
  - `id`, `employeeId` (FK), `date` (date)
  - `status` enum: `present | absent | half_day | leave`
  - `notes?`, `markedById?`, timestamps
  - Unique `(employeeId, date)`
- `SalaryAdvance`
  - `id`, `employeeId`, `date`, `amount` (Decimal), `notes?`, `createdById?`, timestamps
  - Index on `(employeeId, date)`

### Aadhaar file storage (private bucket, backend proxy)

- Actual image/PDF stored in Supabase Storage bucket `employee-documents` at path `employees/{employeeId}/aadhaar/{uuid}-{originalName}`.
- Only file metadata in Postgres (`StoredFile` row + FK from `Employee`).
- Uploads/downloads go through NestJS using service role key. Frontend never touches Supabase Storage directly.

New backend `storage` helper:

- `uploadEmployeeDocument(employeeId, file, documentType)` → uploads to bucket, creates `StoredFile`, returns row.
- `getSignedUrl(storedFileId)` → creates short-lived signed URL (or streams file) after auth check.
- `deleteStoredFile(storedFileId)` → removes from bucket + DB.

Accepted mime types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Size cap ~5 MB.

### Backend modules

- `employees`
  - `POST /employees` (multipart/form-data: fields + `aadhaar` file) — creates employee, uploads file, links `aadhaarDocumentId`.
  - `GET /employees?active=`
  - `GET /employees/:id`
  - `PATCH /employees/:id` (multipart optional — replace Aadhaar → delete old StoredFile + upload new)
  - `PATCH /employees/:id/deactivate` (soft delete)
  - `GET /employees/:id/aadhaar` — returns `{ signedUrl }` after auth check (protected).
- `attendance`
  - `GET /attendance?date=YYYY-MM-DD` — list all active employees with today's mark (or unmarked).
  - `POST /attendance/bulk` — upsert `[{employeeId, status, notes}]` for a date.
  - `GET /attendance/month?employeeId=&year=&month=` — matrix for month view.
- `salary`
  - `GET /salary/summary?year=&month=` — per employee summary (present/half/absent/leave/unmarked counts, attendedDays, gross, advances, net payable).
  - `POST /salary-advances` `{employeeId, date, amount, notes}`
  - `GET /salary-advances?employeeId=&year=&month=`
  - `DELETE /salary-advances/:id`

### Salary formula (server-side)

```
attendedDays = present*1 + half_day*0.5 + absent*0 + leave*0
daysInMonth = actual days in that calendar month
grossRaw    = (monthlySalary / daysInMonth) * attendedDays
gross       = roundToNearest10(grossRaw)     // .5 stays as-is
advances    = SUM(SalaryAdvance.amount) within month
netPayable  = gross - advances
```

`roundToNearest10`: `Math.round(x/10)*10` (7265 → 7270 by JS default; adjust to banker-style so .5 stays 7265 as spec: implement via `if (frac == 5) keep; else Math.round(x/10)*10`).

Unmarked days: `daysInMonth - (present+half+absent+leave)` — shown separately, never counted as present.

### Frontend

- New top-nav item **Attendance** (route `/attendance`) with tabs: **Employees**, **Attendance**, **Salary**, **Salary Advances**.
- **Employees** tab: list, create/edit dialog with file input for Aadhaar (shows selected filename), "View Aadhaar" button that fetches signed URL and opens new tab, deactivate button.
- **Attendance** tab: date picker, table of active employees with status radio (present / half_day / absent / leave) + notes, Save button (bulk upsert). Month view calendar/matrix per employee.
- **Salary** tab: month/year picker, per-employee row showing counts, gross, advances, net payable. Inline "Add advance" opens dialog.
- **Salary Advances** tab: filter by employee/month, add/delete.

### Access control

Only `/users` remains admin-only. Appointments and Attendance nav items visible to all authenticated users; backend routes use `JwtAuthGuard` only.

---

## Migration

File: `backend/prisma/migrations/phase_2_appointments_attendance_salary/migration.sql`

Idempotent (`CREATE TABLE IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object`), matches existing UUID `id` style with `gen_random_uuid()`. Includes:

- enums: `AppointmentStatus`, `AttendanceStatus`
- tables: `Appointment`, `StoredFile`, `Employee`, `Attendance`, `SalaryAdvance`
- FKs: `Appointment.linkedPatientId → Patient`, `Employee.aadhaarDocumentId → StoredFile`, `Attendance.employeeId → Employee`, `SalaryAdvance.employeeId → Employee`
- Indexes and unique constraints as listed above.
- Header comment with Supabase SQL Editor + Prisma CLI instructions.

Prisma schema updated to match; run `prisma generate` (no `prisma migrate` — the SQL file is the source of truth like previous phases).

---

## Files to create / edit

**Backend new:**

- `backend/prisma/migrations/phase_2_appointments_attendance_salary/migration.sql`
- `backend/src/modules/appointments/{controller,service,module}.ts`
- `backend/src/modules/employees/{controller,service,module}.ts`
- `backend/src/modules/attendance/{controller,service,module}.ts`
- `backend/src/modules/salary/{controller,service,module}.ts`
- `backend/src/modules/storage/{storage.service,storage.module}.ts` (Supabase client + upload/signed-url helpers)

**Backend edit:**

- `backend/prisma/schema.prisma` (new models + enums)
- `backend/src/app.module.ts` (register new modules)
- `backend/src/config/env.validation.ts` (add optional Supabase storage vars)
- `backend/package.json` add `@supabase/supabase-js`, `multer`, `@nestjs/platform-express` types

**Frontend new:**

- `src/routes/appointments.tsx`
- `src/routes/attendance.tsx` (with tabbed sub-sections)
- `src/components/appointment-form-dialog.tsx`
- `src/components/employee-form-dialog.tsx`
- Demo-mode mocks for all new endpoints in `src/lib/demo-mode.ts`

**Frontend edit:**

- `src/components/app-shell.tsx` (add Appointments + Attendance nav)
- `src/lib/queries.ts` (hooks for all new endpoints)
- `src/lib/types.ts` (Appointment / Employee / Attendance / SalaryAdvance / SalarySummary types)
- `src/components/patient-form-dialog.tsx` (accept optional `prefill` + `onSuccess(patient)` for appointment conversion — no behavior change when props absent)

---

## Non-goals (explicitly out)

- No auto-conversion of appointment → patient.
- No salary payments in ledger.
- No storage of Aadhaar number text.
- No public bucket / no service-role key in frontend.
- No changes to FY, register numbers, cash flows, historical entry.  
  
  
  

  Before implementing, inspect existing Prisma schema and DB column types. If existing ids are String/Text/cuid style, use TEXT ids for Appointment, Employee, Attendance, StoredFile, SalaryAdvance and generate ids consistently. Do not force uuid/gen_random_uuid unless existing project actually uses uuid columns.  
    
  This plan says file path:
  employees/{employeeId}/aadhaar/{uuid}-{originalName}
  That means employee ID is needed before upload. So backend should do:
  1. Create Employee first with aadhaarDocumentId = null
  2. Upload Aadhaar file using created employeeId in path
  3. Create StoredFile row
  4. Update Employee.aadhaarDocumentId
  If upload fails, either delete the employee or return a clear error. Ask Lovable to handle this cleanly.  

  Avoid hard-deleting appointment records unless absolutely needed. Prefer status=cancelled or soft delete for audit.  
    
  The rounding rule is okay because you gave that requirement:
  7263 → 7260
  7266 → 7270
  7265 → 7265
  Just ensure Lovable applies it to gross salary before advance deduction, like:
  grossRaw = monthlySalary / daysInMonth * attendedDays
  gross = customRoundedGross
  netPayable = gross - advances
  Not after deducting advance.
    
  Before starting, please verify existing ID column style from Prisma schema and DB. Do not assume uuid/gen_random_uuid unless existing tables actually use uuid. New FK columns must match existing User.id and Patient.id types. Also handle employee Aadhaar creation as create employee → upload file → create StoredFile → update Employee.aadhaarDocumentId. Prefer soft cancel over hard delete for appointments unless delete is internal soft delete. Salary rounding should apply to gross salary before advance deduction.