/**
 * Pure builders for the Analytics Daily / Monthly Collection Reports.
 * Kept dependency-free so the SAME code runs in the lab server
 * (backend/src/modules/analytics/report-builder.ts is a copy) and in offline demo mode.
 *
 * Paid / collection figures come ONLY from (already netted) Payment rows.
 * Opening/closing balance, cash handover, cash added and expenses are never used.
 */

export type LabKey = "metropolis" | "lupin" | "qualilife" | "tests";

export interface ReportPatient {
  id: string;
  registerNumber: number;
  financialYear: string;
  name: string;
  ageValue: number | null;
  ageUnit: string | null;
  sex: string;
  entryDate: string; // YYYY-MM-DD
  total: number;
  discount: number;
  net: number;
  tests: Array<{ name: string; lab: string | null; rate: number }>;
}

export interface ReportPayment {
  patientId: string;
  date: string; // YYYY-MM-DD
  kind: string; // advance | balance
  mode: string; // cash | upi | card | ...
  amount: number;
}

export interface ModeAmount { mode: string; amount: number }

export interface DailyPatientRow {
  id: string;
  registerNumber: number;
  name: string;
  ageSex: string;
  testNames: string[];
  metropolis: number;
  lupin: number;
  qualilife: number;
  tests: number;
  total: number;
  discount: number;
  paid: number;
  paidParts: ModeAmount[];
  balance: number;
}

export interface SettlementRow {
  date: string;
  registerNumber: number;
  financialYear: string;
  name: string;
  entryDate: string;
  amount: number;
  mode: string;
}

export interface ModeTotals { cash: number; upi: number; card: number; other: number }

export interface DailyReport {
  date: string;
  patients: DailyPatientRow[];
  patientTotals: Omit<DailyPatientRow, "id" | "registerNumber" | "name" | "ageSex" | "testNames" | "paidParts">;
  futureSettlements: SettlementRow[];
  previousBalances: SettlementRow[];
  todayCollection: ModeTotals;
  previousCollection: ModeTotals;
  totalCollection: ModeTotals;
}

export interface MonthlyRow {
  date: string;
  metropolis: number;
  lupin: number;
  qualilife: number;
  tests: number;
  total: number;
  discount: number;
  paid: number;
}

export interface MonthlyReport {
  month: string; // YYYY-MM
  rows: MonthlyRow[];
  totals: Omit<MonthlyRow, "date">;
}

export function labKey(lab: string | null | undefined): LabKey {
  const l = (lab || "").toLowerCase();
  if (l.includes("metropolis")) return "metropolis";
  if (l.includes("lupin")) return "lupin";
  if (l.includes("quali")) return "qualilife";
  return "tests";
}

const UNIT: Record<string, string> = { days: "D", months: "M", years: "Y" };

function ageSex(p: ReportPatient) {
  const unit = p.ageUnit && p.ageUnit !== "years" ? ` ${UNIT[p.ageUnit] ?? p.ageUnit}` : "";
  const sex = (p.sex || "").charAt(0).toUpperCase();
  return `${p.ageValue ?? ""}${unit} / ${sex}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const emptyModes = (): ModeTotals => ({ cash: 0, upi: 0, card: 0, other: 0 });
function addMode(t: ModeTotals, mode: string, amount: number) {
  if (mode === "cash") t.cash += amount;
  else if (mode === "upi") t.upi += amount;
  else if (mode === "card") t.card += amount;
  else t.other += amount;
}

function labSplit(p: ReportPatient) {
  const s = { metropolis: 0, lupin: 0, qualilife: 0, tests: 0 };
  for (const t of p.tests) s[labKey(t.lab)] += t.rate;
  return s;
}

/**
 * @param dayPatients  patients with entryDate === date
 * @param dayPatientPayments  all payments of those patients (any date)
 * @param previousRows  balance payments on `date` from patients with entryDate < date (with patient info)
 */
export function buildDailyReport(
  date: string,
  dayPatients: ReportPatient[],
  dayPatientPayments: ReportPayment[],
  previousRows: SettlementRow[],
): DailyReport {
  const byId = new Map(dayPatients.map(p => [p.id, p]));
  const todayCollection = emptyModes();
  const totals = { metropolis: 0, lupin: 0, qualilife: 0, tests: 0, total: 0, discount: 0, paid: 0, balance: 0 };

  const patients: DailyPatientRow[] = [...dayPatients]
    .sort((a, b) => a.registerNumber - b.registerNumber)
    .map(p => {
      const mine = dayPatientPayments.filter(x => x.patientId === p.id && x.amount > 0);
      const onDay = mine.filter(x => x.date === date);
      const upTo = mine.filter(x => x.date <= date).reduce((s, x) => s + x.amount, 0);
      const parts = new Map<string, number>();
      for (const x of onDay) {
        parts.set(x.mode, (parts.get(x.mode) ?? 0) + x.amount);
        addMode(todayCollection, x.mode, x.amount);
      }
      const paid = onDay.reduce((s, x) => s + x.amount, 0);
      const split = labSplit(p);
      const row: DailyPatientRow = {
        id: p.id,
        registerNumber: p.registerNumber,
        name: p.name,
        ageSex: ageSex(p),
        testNames: p.tests.map(t => t.name),
        ...split,
        total: p.total,
        discount: p.discount,
        paid: r2(paid),
        paidParts: [...parts.entries()].map(([mode, amount]) => ({ mode, amount: r2(amount) })),
        balance: r2(Math.max(0, p.net - upTo)),
      };
      totals.metropolis += row.metropolis; totals.lupin += row.lupin; totals.qualilife += row.qualilife;
      totals.tests += row.tests; totals.total += row.total; totals.discount += row.discount;
      totals.paid += row.paid; totals.balance += row.balance;
      return row;
    });

  const futureSettlements: SettlementRow[] = dayPatientPayments
    .filter(x => x.date > date && x.kind === "balance" && x.amount > 0 && byId.has(x.patientId))
    .map(x => {
      const p = byId.get(x.patientId)!;
      return { date: x.date, registerNumber: p.registerNumber, financialYear: p.financialYear, name: p.name, entryDate: p.entryDate, amount: r2(x.amount), mode: x.mode };
    })
    .sort((a, b) => (a.date === b.date ? a.registerNumber - b.registerNumber : a.date < b.date ? -1 : 1));

  const previousCollection = emptyModes();
  for (const r of previousRows) addMode(previousCollection, r.mode, r.amount);

  const totalCollection: ModeTotals = {
    cash: r2(todayCollection.cash + previousCollection.cash),
    upi: r2(todayCollection.upi + previousCollection.upi),
    card: r2(todayCollection.card + previousCollection.card),
    other: r2(todayCollection.other + previousCollection.other),
  };

  return {
    date,
    patients,
    patientTotals: totals,
    futureSettlements,
    previousBalances: [...previousRows].sort((a, b) => a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.registerNumber - b.registerNumber),
    todayCollection,
    previousCollection,
    totalCollection,
  };
}

function shift(k: string, days: number) {
  const d = new Date(`${k}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Working days (Mon–Sat) of a month, capped at `today` for the ongoing month. */
export function monthDays(month: string, today: string) {
  const out: string[] = [];
  let d = `${month}-01`;
  while (d.slice(0, 7) === month && d <= today) {
    if (new Date(`${d}T00:00:00.000Z`).getUTCDay() !== 0) out.push(d);
    d = shift(d, 1);
  }
  return out;
}

/**
 * @param patients  patients entered in the month
 * @param payments  payments (any date) of those patients
 * Paid for a date = payments made on that date by patients entered that same date.
 */
export function buildMonthlyReport(month: string, today: string, patients: ReportPatient[], payments: ReportPayment[]): MonthlyReport {
  const entryOf = new Map(patients.map(p => [p.id, p.entryDate]));
  const rows: MonthlyRow[] = monthDays(month, today).map(date => {
    const row: MonthlyRow = { date, metropolis: 0, lupin: 0, qualilife: 0, tests: 0, total: 0, discount: 0, paid: 0 };
    for (const p of patients) {
      if (p.entryDate !== date) continue;
      const s = labSplit(p);
      row.metropolis += s.metropolis; row.lupin += s.lupin; row.qualilife += s.qualilife; row.tests += s.tests;
      row.discount += p.discount;
    }
    row.total = row.metropolis + row.lupin + row.qualilife + row.tests;
    for (const x of payments) {
      if (x.date === date && entryOf.get(x.patientId) === date && x.amount > 0) row.paid += x.amount;
    }
    (Object.keys(row) as Array<keyof MonthlyRow>).forEach(k => { if (k !== "date") (row as any)[k] = r2(row[k] as number); });
    return row;
  });
  const totals = { metropolis: 0, lupin: 0, qualilife: 0, tests: 0, total: 0, discount: 0, paid: 0 };
  for (const r of rows) (Object.keys(totals) as Array<keyof typeof totals>).forEach(k => { totals[k] = r2(totals[k] + r[k]); });
  return { month, rows, totals };
}
