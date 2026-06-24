export type Sex = "M" | "F" | "O";
export type PaymentMode = "cash" | "upi";

export interface TestCatalog {
  id: string;
  name: string;
  rate: string; // Decimal serialized as string
  outsourced: boolean;
  outsourcedLab?: string | null;
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
  age: number;
  sex: Sex;
  referredDoctor?: string | null;
  notes?: string | null;
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

export interface TodayResponse {
  date: string;
  ledger: DailyLedger;
  patients: Patient[];
  totals: {
    total: string;
    discount: string;
    net: string;
    collected: string;
    balance: string;
    expenses: string;
    count: number;
  };
  expenses: Expense[];
}

export interface UpsertPatientInput {
  name: string;
  mobile: string;
  age: number;
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
}
