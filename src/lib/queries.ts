import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { CashHandover, Expense, Patient, PaymentMode, TestCatalog, TodayResponse, UpsertPatientInput } from "./types";

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
