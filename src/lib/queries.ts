import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Expense, Patient, TestCatalog, TodayResponse, UpsertPatientInput } from "./types";

export const qk = {
  today: ["today"] as const,
  tests: ["tests"] as const,
  search: (q: string) => ["search", q] as const,
  patient: (id: string) => ["patient", id] as const,
  users: ["users"] as const,
};

export function useToday() {
  return useQuery({
    queryKey: qk.today,
    queryFn: () => api<TodayResponse>("/ledger/today"),
    refetchOnWindowFocus: true,
  });
}

export function useTests() {
  return useQuery({ queryKey: qk.tests, queryFn: () => api<TestCatalog[]>("/tests") });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPatientInput) =>
      api<Patient>("/patients", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.today }),
  });
}

export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPatientInput) =>
      api<Patient>(`/patients/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.today }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.today }),
  });
}
