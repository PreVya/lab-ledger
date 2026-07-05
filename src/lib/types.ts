export type Sex = "M" | "F" | "O";
export type PaymentMode = "cash" | "upi" | "card" | "other";
export type AgeUnit = "days" | "months" | "years";
export type PaymentKind = "advance" | "balance";

export interface TestCatalog {
  id: string;
  name: string;
  rate: string;
  outsourced: boolean;
  outsourcedLab?: string | null;
  /** Only used for outsourced tests (e.g. Metropolis M1234). Nullable. */
  testCode?: string | null;
  active: boolean;
}

export interface PatientTest {
  id: string;
  testId: string;
  rateAtEntry: string;
  test: TestCatalog;
}

export interface Patient {
  id: string;
  dailySerial: number;
  registerNumber: number;
  financialYear: string;
  entryDate: string;
  name: string;
  mobile: string;
  /** Legacy (years). Prefer ageValue + ageUnit for display. */
  age: number;
  ageValue?: number | null;
  ageUnit?: AgeUnit;
  sex: Sex;
  referredDoctor?: string | null;
  notes?: string | null;
  createdById?: string | null;
  total: string;
  discount: string;
  net: string;
  advanceCash: string;
  advanceUpi: string;
  advancePaidOn?: string | null;
  balance: string;
  balanceCash: string;
  balanceUpi: string;
  balancePaidOn?: string | null;
  tests: PatientTest[];
}

export interface DailyLedger {
  id: string;
  date: string;
  openingBalance: string;
  closingBalance: string;
  notes?: string | null;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: string;
  mode: PaymentMode;
}

export interface CashHandover {
  id: string;
  date: string;
  amount: string;
  notes?: string | null;
  createdById?: string | null;
  createdAt: string;
}

export interface CashAdded {
  id: string;
  date: string;
  amount: string;
  notes?: string | null;
  createdById?: string | null;
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  patientId: string;
  date: string;
  kind: PaymentKind;
  mode: PaymentMode;
  amount: string;
  notes?: string | null;
  createdAt: string;
  patient?: {
    id: string;
    name: string;
    mobile: string;
    registerNumber: number;
    dailySerial: number;
    entryDate: string;
    financialYear: string;
  };
}

export interface TodayResponse {
  date: string;
  ledger: DailyLedger;
  patients: Patient[];
  totals: {
    total: string;
    discount: string;
    net: string;
    collected: string;
    cashCollected: string;
    upiCollected: string;
    cardCollected: string;
    otherCollected: string;
    balance: string;
    expenses: string;
    cashExpenses: string;
    cashTakenAway: string;
    addedCash: string;
    openingCashBalance: string;
    closingCashBalance: string;
    count: number;
  };
  expenses: Expense[];
  payments: PaymentRow[];
  cashHandovers: CashHandover[];
  cashAdded: CashAdded[];
}

export interface UpsertPatientInput {
  name: string;
  mobile: string;
  ageValue: number;
  ageUnit: AgeUnit;
  sex: Sex;
  referredDoctor?: string;
  notes?: string;
  testIds: string[];
  discount?: number;
  advanceCash?: number;
  advanceUpi?: number;
  advancePaidOn?: string | null;
  balanceCash?: number;
  balanceUpi?: number;
  balancePaidOn?: string | null;
  /** Explicit entryDate (YYYY-MM-DD) — allows historical/future entries. Defaults to today on backend. */
  entryDate?: string | null;
}

export function formatAge(p: Pick<Patient, "age" | "ageValue" | "ageUnit">): string {
  const val = p.ageValue ?? p.age ?? 0;
  const unit = p.ageUnit ?? "years";
  return `${val} ${unit}`;
}
