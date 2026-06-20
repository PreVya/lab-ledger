import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Expense, Patient, TestCatalog, TodayResponse, UpsertPatientInput } from "./types";

export const qk = {
  today: ["today"] as const,
  tests: ["tests"] as const,
  search: (q: string) => ["search", q] as const,
  patient: (id: string) => ["patient", id] as const,
  users: ["users"] as const,
};

// --- Cache helpers: instantly patch the Today register so the UI updates
// without waiting for the refetch round-trip. ---

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

function patchToday(qc: QueryClient, mutator: (prev: TodayResponse) => TodayResponse) {
  qc.setQueryData<TodayResponse>(qk.today, (prev) => (prev ? mutator(prev) : prev));
}

function upsertPatientInToday(qc: QueryClient, patient: Patient) {
  patchToday(qc, (prev) => {
    const idx = prev.patients.findIndex((p) => p.id === patient.id);
    const patients = idx === -1
      ? [...prev.patients, patient].sort((a, b) => a.dailySerial - b.dailySerial)
      : prev.patients.map((p) => (p.id === patient.id ? patient : p));
    const { totals, closingBalance } = recomputeTotals(patients, prev.expenses, prev.ledger.openingBalance);
    return { ...prev, patients, totals, ledger: { ...prev.ledger, closingBalance } };
  });
}

function addExpenseToToday(qc: QueryClient, expense: Expense) {
  patchToday(qc, (prev) => {
    const expenses = [expense, ...prev.expenses.filter((e) => e.id !== expense.id)];
    const { totals, closingBalance } = recomputeTotals(prev.patients, expenses, prev.ledger.openingBalance);
    return { ...prev, expenses, totals, ledger: { ...prev.ledger, closingBalance } };
  });
}

function removeExpenseFromToday(qc: QueryClient, id: string) {
  patchToday(qc, (prev) => {
    const expenses = prev.expenses.filter((e) => e.id !== id);
    const { totals, closingBalance } = recomputeTotals(prev.patients, expenses, prev.ledger.openingBalance);
    return { ...prev, expenses, totals, ledger: { ...prev.ledger, closingBalance } };
  });
}

// --- Queries ---

export function useToday() {
  return useQuery({
    queryKey: qk.today,
    queryFn: () => api<TodayResponse>("/ledger/today"),
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });
}

export function useTests() {
  return useQuery({ queryKey: qk.tests, queryFn: () => api<TestCatalog[]>("/tests"), staleTime: 60_000 });
}

// --- Mutations: optimistic cache patch + invalidate as safety net ---

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPatientInput) =>
      api<Patient>("/patients", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (patient) => {
      upsertPatientInToday(qc, patient);
      qc.invalidateQueries({ queryKey: qk.today });
    },
  });
}

export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPatientInput) =>
      api<Patient>(`/patients/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: (patient) => {
      upsertPatientInToday(qc, patient);
      qc.setQueryData(qk.patient(id), patient);
      qc.invalidateQueries({ queryKey: qk.today });
      qc.invalidateQueries({ queryKey: qk.patient(id) });
    },
  });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: qk.search(q),
    queryFn: () => api<Patient[]>(`/patients/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { description: string; amount: number; mode: "cash" | "upi" }) =>
      api<Expense>("/expenses", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (expense) => {
      addExpenseToToday(qc, expense);
      qc.invalidateQueries({ queryKey: qk.today });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}`, { method: "DELETE" }).then(() => id),
    onMutate: async (id: string) => {
      // Optimistic remove — UI updates before the network roundtrip finishes.
      await qc.cancelQueries({ queryKey: qk.today });
      const prev = qc.getQueryData<TodayResponse>(qk.today);
      removeExpenseFromToday(qc, id);
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.today, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.today });
    },
  });
}
