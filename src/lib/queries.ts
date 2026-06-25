import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Expense, Patient, TestCatalog, TodayResponse, UpsertPatientInput } from "./types";

/**
 * Today's IST (Asia/Kolkata) business date as YYYY-MM-DD.
 * The lab operates in IST; using UTC would shift the "today" key for any
 * activity between 00:00–05:30 IST. Matches backend ledger.dateOnly().
 */
export function todayKey(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export const qk = {
  ledger: (date: string) => ["ledger", date] as const,
  today: ["ledger", todayKey()] as const, // legacy alias; resolved at import time
  tests: ["tests"] as const,
  search: (q: string, fy?: string) => ["search", q, fy ?? ""] as const,
  patient: (id: string) => ["patient", id] as const,
  users: ["users"] as const,
};

// --- Cache helpers ------------------------------------------------------

function recomputeTotals(patients: Patient[], expenses: Expense[], openingBalance: string) {
  const total = patients.reduce((s, p) => s + Number(p.total), 0);
  const discount = patients.reduce((s, p) => s + Number(p.discount), 0);
  const net = patients.reduce((s, p) => s + Number(p.net), 0);
  const collected = patients.reduce(
    (s, p) => s + Number(p.advanceCash) + Number(p.advanceUpi) + Number(p.balanceCash) + Number(p.balanceUpi),
    0,
  );
  const balance = patients.reduce((s, p) => s + Number(p.balance), 0);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const closingBalance = Number(openingBalance) + collected - expenseTotal;
  return {
    totals: {
      total: String(total),
      discount: String(discount),
      net: String(net),
      collected: String(collected),
      balance: String(balance),
      expenses: String(expenseTotal),
      count: patients.length,
    },
    closingBalance: String(closingBalance),
  };
}

function patchLedger(qc: QueryClient, date: string, mutator: (prev: TodayResponse) => TodayResponse) {
  qc.setQueryData<TodayResponse>(qk.ledger(date), (prev) => (prev ? mutator(prev) : prev));
}

function upsertPatient(qc: QueryClient, date: string, patient: Patient) {
  patchLedger(qc, date, (prev) => {
    const idx = prev.patients.findIndex((p) => p.id === patient.id);
    const patients = idx === -1
      ? [...prev.patients, patient].sort((a, b) => a.registerNumber - b.registerNumber)
      : prev.patients.map((p) => (p.id === patient.id ? patient : p));
    const { totals, closingBalance } = recomputeTotals(patients, prev.expenses, prev.ledger.openingBalance);
    return { ...prev, patients, totals, ledger: { ...prev.ledger, closingBalance } };
  });
}

function addExpense(qc: QueryClient, date: string, expense: Expense) {
  patchLedger(qc, date, (prev) => {
    const expenses = [expense, ...prev.expenses.filter((e) => e.id !== expense.id)];
    const { totals, closingBalance } = recomputeTotals(prev.patients, expenses, prev.ledger.openingBalance);
    return { ...prev, expenses, totals, ledger: { ...prev.ledger, closingBalance } };
  });
}

function removeExpense(qc: QueryClient, date: string, id: string) {
  patchLedger(qc, date, (prev) => {
    const expenses = prev.expenses.filter((e) => e.id !== id);
    const { totals, closingBalance } = recomputeTotals(prev.patients, expenses, prev.ledger.openingBalance);
    return { ...prev, expenses, totals, ledger: { ...prev.ledger, closingBalance } };
  });
}

// --- Queries ------------------------------------------------------------

/** Generic ledger query for any date (YYYY-MM-DD). */
export function useLedger(date: string) {
  const isToday = date === todayKey();
  return useQuery({
    queryKey: qk.ledger(date),
    queryFn: () =>
      api<TodayResponse>(isToday ? "/ledger/today" : `/ledger?date=${date}`),
    refetchOnWindowFocus: isToday,
    refetchOnMount: "always",
    staleTime: isToday ? 0 : 30_000,
  });
}

/** Today-only convenience (back-compat). */
export function useToday() {
  return useLedger(todayKey());
}

export function useTests() {
  return useQuery({ queryKey: qk.tests, queryFn: () => api<TestCatalog[]>("/tests"), staleTime: 60_000 });
}

// --- Mutations ----------------------------------------------------------
// Patient mutations always affect today (entry date = today server-side).
// Expense mutations are scoped to today as well.

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPatientInput) =>
      api<Patient>("/patients", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (patient) => {
      const date = patient.entryDate.slice(0, 10);
      upsertPatient(qc, date, patient);
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
      upsertPatient(qc, date, patient);
      qc.setQueryData(qk.patient(id), patient);
      qc.invalidateQueries({ queryKey: qk.ledger(date) });
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

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { description: string; amount: number; mode: "cash" | "upi" }) =>
      api<Expense>("/expenses", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (expense) => {
      const date = expense.date.slice(0, 10);
      addExpense(qc, date, expense);
      qc.invalidateQueries({ queryKey: qk.ledger(date) });
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
      removeExpense(qc, date, id);
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.ledger(date), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.ledger(date) });
    },
  });
}
