import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { CashAdded, CashHandover, Expense, Patient, PaymentMode, TestCatalog, TodayResponse, UpsertPatientInput } from "./types";

/** Today's IST (Asia/Kolkata) business date as YYYY-MM-DD. */
export function todayKey(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export const qk = {
  ledger: (date: string) => ["ledger", date] as const,
  today: ["ledger", todayKey()] as const,
  tests: ["tests"] as const,
  search: (q: string, fy?: string) => ["search", q, fy ?? ""] as const,
  patient: (id: string) => ["patient", id] as const,
  users: ["users"] as const,
};

// --- Cache helpers ------------------------------------------------------

function patchLedger(qc: QueryClient, date: string, mutator: (prev: TodayResponse) => TodayResponse) {
  qc.setQueryData<TodayResponse>(qk.ledger(date), (prev) => (prev ? mutator(prev) : prev));
}

// --- Queries ------------------------------------------------------------

export function useLedger(date: string) {
  const isToday = date === todayKey();
  return useQuery({
    queryKey: qk.ledger(date),
    queryFn: () => api<TodayResponse>(isToday ? "/ledger/today" : `/ledger?date=${date}`),
    refetchOnWindowFocus: isToday,
    refetchOnMount: "always",
    staleTime: isToday ? 0 : 30_000,
  });
}

export function useToday() { return useLedger(todayKey()); }

export function useTests() {
  return useQuery({ queryKey: qk.tests, queryFn: () => api<TestCatalog[]>("/tests"), staleTime: 60_000 });
}

// --- Mutations ----------------------------------------------------------

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPatientInput) =>
      api<Patient>("/patients", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (patient) => {
      const date = patient.entryDate.slice(0, 10);
      qc.invalidateQueries({ queryKey: qk.ledger(date) });
    },
  });
}

export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPatientInput) =>
      api<Patient>(`/patients/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: (patient) => {
      const date = patient.entryDate.slice(0, 10);
      qc.setQueryData(qk.patient(id), patient);
      qc.invalidateQueries({ queryKey: qk.ledger(date) });
      qc.invalidateQueries({ queryKey: qk.ledger(todayKey()) });
      qc.invalidateQueries({ queryKey: qk.patient(id) });
    },
  });
}

export function useSearch(q: string, fy?: string) {
  return useQuery({
    queryKey: qk.search(q, fy),
    queryFn: () => {
      const params = new URLSearchParams({ q });
      if (fy) params.set("fy", fy);
      return api<Patient[]>(`/patients/search?${params.toString()}`);
    },
    enabled: q.trim().length > 0,
  });
}

export function useCreateExpense(date?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { description: string; amount: number; mode: PaymentMode }) =>
      api<Expense>("/expenses", {
        method: "POST",
        body: JSON.stringify(date ? { ...input, date } : input),
      }),
    onSuccess: (expense) => {
      const d = expense.date.slice(0, 10);
      qc.invalidateQueries({ queryKey: qk.ledger(d) });
    },
  });
}

export function useDeleteExpense(date: string = todayKey()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}`, { method: "DELETE" }).then(() => id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: qk.ledger(date) });
      const prev = qc.getQueryData<TodayResponse>(qk.ledger(date));
      patchLedger(qc, date, (p) => ({ ...p, expenses: p.expenses.filter((e) => e.id !== id) }));
      return { prev };
    },
    onError: (_e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(qk.ledger(date), ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.ledger(date) }); },
  });
}

// --- Cash handover ------------------------------------------------------

export function useCreateCashHandover(date: string = todayKey()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; notes?: string }) =>
      api<CashHandover>("/cash-handover", {
        method: "POST",
        body: JSON.stringify({ ...input, date }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ledger(date) });
    },
  });
}

export function useDeleteCashHandover(date: string = todayKey()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/cash-handover/${id}`, { method: "DELETE" }).then(() => id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ledger(date) }); },
  });
}

// --- Cash added ---------------------------------------------------------

export function useCreateCashAdded(date: string = todayKey()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; notes?: string }) =>
      api<CashAdded>("/cash-added", {
        method: "POST",
        body: JSON.stringify({ ...input, date }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ledger(date) }); },
  });
}

export function useDeleteCashAdded(date: string = todayKey()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/cash-added/${id}`, { method: "DELETE" }).then(() => id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ledger(date) }); },
  });
}

// ============= Phase 2: Appointments / Employees / Attendance / Salary =============
import type { Appointment, AttendanceDayResponse, Employee, Holiday, SalaryAdvance, SalarySummaryRow } from "./types";
import { API_BASE_URL, loadAuth } from "./api";

const qk2 = {
  appointments: (date?: string, status?: string, q?: string) => ["appointments", date ?? "", status ?? "", q ?? ""] as const,
  employees: ["employees"] as const,
  attendanceDate: (date: string) => ["attendance", date] as const,
  salarySummary: (y: number, m: number) => ["salary-summary", y, m] as const,
  salaryAdvances: (empId?: string, y?: number, m?: number) => ["salary-advances", empId ?? "", y ?? 0, m ?? 0] as const,
};

export function useAppointments(filters: { date?: string; status?: string; q?: string }) {
  return useQuery({
    queryKey: qk2.appointments(filters.date, filters.status, filters.q),
    queryFn: () => {
      const p = new URLSearchParams();
      if (filters.date) p.set("date", filters.date);
      if (filters.status) p.set("status", filters.status);
      if (filters.q) p.set("q", filters.q);
      return api<Appointment[]>(`/appointments?${p.toString()}`);
    },
  });
}
export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => api<Appointment>("/appointments", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}
export function useUpdateAppointment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => api<Appointment>(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}
export function useLinkAppointmentPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ appointmentId, patientId }: { appointmentId: string; patientId: string }) =>
      api<Appointment>(`/appointments/${appointmentId}/link-patient`, { method: "POST", body: JSON.stringify({ patientId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

// -------- Employees (multipart) --------
async function apiForm<T>(path: string, method: string, form: FormData): Promise<T> {
  const a = loadAuth();
  const h = new Headers();
  if (a) h.set("Authorization", `Bearer ${a.accessToken}`);
  const res = await fetch(`${API_BASE_URL}/api${path}`, { method, headers: h, body: form });
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const msg = (body && typeof body === "object" && "message" in (body as any) && (body as any).message) || res.statusText;
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
  return body as T;
}

export function useEmployees() {
  return useQuery({ queryKey: qk2.employees, queryFn: () => api<Employee[]>("/employees") });
}
export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fd: FormData) => apiForm<Employee>("/employees", "POST", fd),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk2.employees }),
  });
}
export function useUpdateEmployee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fd: FormData) => apiForm<Employee>(`/employees/${id}`, "PATCH", fd),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk2.employees }),
  });
}
export function useDeactivateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/employees/${id}/deactivate`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk2.employees }),
  });
}
export function useEmployeeAadhaar() {
  return useMutation({
    mutationFn: (id: string) => api<{ signedUrl: string; file: { originalName: string; mimeType: string } }>(`/employees/${id}/aadhaar`),
  });
}

// -------- Attendance --------
export function useAttendanceByDate(date: string) {
  return useQuery({
    queryKey: qk2.attendanceDate(date),
    queryFn: () => api<AttendanceDayResponse>(`/attendance?date=${date}`),
  });
}
export function useSaveAttendanceBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: string; entries: Array<{ employeeId: string; status: string; notes?: string }> }) =>
      api("/attendance/bulk", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: qk2.attendanceDate(v.date) }),
  });
}

// -------- Holidays --------
export function useHolidays(year?: number, month?: number) {
  return useQuery({
    queryKey: ["holidays", year ?? 0, month ?? 0],
    queryFn: () => {
      const p = new URLSearchParams();
      if (year) p.set("year", String(year));
      if (month) p.set("month", String(month));
      return api<Holiday[]>(`/holidays?${p.toString()}`);
    },
  });
}
export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: string; name: string; notes?: string }) =>
      api<Holiday>("/holidays", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: qk2.attendanceDate(v.date) });
      qc.invalidateQueries({ queryKey: ["salary-summary"] });
    },
  });
}
export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/holidays/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["salary-summary"] });
    },
  });
}

// -------- Salary --------
export function useSalarySummary(year: number, month: number) {
  return useQuery({
    queryKey: qk2.salarySummary(year, month),
    queryFn: () => api<SalarySummaryRow[]>(`/salary/summary?year=${year}&month=${month}`),
  });
}
export function useSalaryAdvances(filters: { employeeId?: string; year?: number; month?: number }) {
  return useQuery({
    queryKey: qk2.salaryAdvances(filters.employeeId, filters.year, filters.month),
    queryFn: () => {
      const p = new URLSearchParams();
      if (filters.employeeId) p.set("employeeId", filters.employeeId);
      if (filters.year) p.set("year", String(filters.year));
      if (filters.month) p.set("month", String(filters.month));
      return api<SalaryAdvance[]>(`/salary-advances?${p.toString()}`);
    },
  });
}
export function useCreateSalaryAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { employeeId: string; date: string; amount: number; notes?: string }) =>
      api<SalaryAdvance>("/salary-advances", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["salary-summary"] }); qc.invalidateQueries({ queryKey: ["salary-advances"] }); },
  });
}
export function useDeleteSalaryAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/salary-advances/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["salary-summary"] }); qc.invalidateQueries({ queryKey: ["salary-advances"] }); },
  });
}
