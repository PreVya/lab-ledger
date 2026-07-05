import type { AuthState, AuthUser } from "./api";
import type { AgeUnit, CashAdded, CashHandover, PaymentMode, PaymentRow, Sex } from "./types";

const DEMO_USERS: Array<{ username: string; password: string; user: AuthUser }> = [
  { username: "admin", password: "admin", user: { id: "demo-admin", username: "admin", fullName: "System Admin", role: "admin" } },
  { username: "prer",  password: "prer",  user: { id: "demo-prer",  username: "prer",  fullName: "Prer",         role: "receptionist" } },
  { username: "gaya",  password: "gaya",  user: { id: "demo-gaya",  username: "gaya",  fullName: "Gaya",         role: "technician" } },
];

export function tryDemoLogin(username: string, password: string): AuthState | null {
  const hit = DEMO_USERS.find(u => u.username === username && u.password === password);
  if (!hit) return null;
  return { accessToken: `demo.${hit.user.id}`, user: hit.user };
}
export function isDemoToken(token: string | undefined | null) {
  return !!token && token.startsWith("demo.");
}

function todayIST() {
  const IST = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST).toISOString().slice(0, 10);
}

interface DemoTest { id: string; name: string; rate: string; outsourced: boolean; outsourcedLab?: string | null; testCode?: string | null; active: boolean }
interface DemoPatient {
  id: string; dailySerial: number; registerNumber: number; financialYear: string;
  entryDate: string; name: string; mobile: string;
  age: number; ageValue: number; ageUnit: AgeUnit; sex: Sex;
  referredDoctor: string | null; notes: string | null; createdById: string | null;
  total: string; discount: string; net: string;
  advanceCash: string; advanceUpi: string; advancePaidOn: string | null;
  balance: string; balanceCash: string; balanceUpi: string; balancePaidOn: string | null;
  tests: Array<{ id: string; testId: string; rateAtEntry: string; test: DemoTest }>;
}
interface DemoExpense { id: string; date: string; description: string; amount: string; mode: PaymentMode; createdAt: string }

const store = {
  tests: [
    { id: "t1", name: "CBC", rate: "250", outsourced: false, outsourcedLab: null, active: true },
    { id: "t2", name: "Blood Sugar (Fasting)", rate: "80", outsourced: false, outsourcedLab: null, active: true },
    { id: "t3", name: "Lipid Profile", rate: "600", outsourced: false, outsourcedLab: null, active: true },
    { id: "t4", name: "Thyroid (T3, T4, TSH)", rate: "450", outsourced: false, outsourcedLab: null, active: true },
    { id: "t5", name: "HbA1c", rate: "350", outsourced: false, outsourcedLab: null, active: true },
    { id: "t6", name: "Vitamin D", rate: "1200", outsourced: true, outsourcedLab: "Metropolis", active: true },
    { id: "t7", name: "Vitamin D", rate: "1500", outsourced: true, outsourcedLab: "Lupin Diagnostics", active: true },
  ] as DemoTest[],
  patients: [] as DemoPatient[],
  expenses: [] as DemoExpense[],
  payments: [] as PaymentRow[],
  handovers: [] as CashHandover[],
  cashAdded: [] as CashAdded[],
  ledgers: {} as Record<string, { openingBalance: string; closingBalance: string }>,
  users: DEMO_USERS.map(d => ({ id: d.user.id, username: d.user.username, fullName: d.user.fullName, role: d.user.role, active: true })),
  serial: 0,
  reg: 0,
  currentUserId: "demo-admin",
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function fyFor(d: string) {
  const [y, m] = d.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function ledgerFor(date: string) {
  if (!store.ledgers[date]) {
    // opening = prior day closing
    const days = Object.keys(store.ledgers).filter(d => d < date).sort();
    const prev = days.length ? store.ledgers[days[days.length - 1]] : { closingBalance: "0" };
    store.ledgers[date] = { openingBalance: prev.closingBalance, closingBalance: prev.closingBalance };
  }
  return store.ledgers[date];
}

function summary(date: string) {
  const ledger = ledgerFor(date);
  const patients = store.patients.filter(p => p.entryDate === date).sort((a, b) => a.registerNumber - b.registerNumber);
  const expenses = store.expenses.filter(e => e.date === date);
  const payments = store.payments.filter(p => p.date === date);
  const handovers = store.handovers.filter(h => h.date === date);
  const cashAddedEntries = store.cashAdded.filter(c => c.date === date);

  let cash = 0, upi = 0, card = 0, other = 0;
  for (const p of payments) {
    const a = Number(p.amount);
    if (p.mode === "cash") cash += a;
    else if (p.mode === "upi") upi += a;
    else if (p.mode === "card") card += a;
    else other += a;
  }
  const collected = cash + upi + card + other;
  const cashExpenses = expenses.filter(e => e.mode === "cash").reduce((s, e) => s + Number(e.amount), 0);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const cashTakenAway = handovers.reduce((s, h) => s + Number(h.amount), 0);
  const addedCash = cashAddedEntries.reduce((s, c) => s + Number(c.amount), 0);
  const opening = Number(ledger.openingBalance);
  const closing = opening + cash - cashExpenses - cashTakenAway + addedCash;
  ledger.closingBalance = String(closing);

  return {
    date,
    ledger: { id: "demo-ledger-" + date, date, openingBalance: String(opening), closingBalance: String(closing), notes: null },
    patients,
    totals: {
      total: String(patients.reduce((s, p) => s + Number(p.total), 0)),
      discount: String(patients.reduce((s, p) => s + Number(p.discount), 0)),
      net: String(patients.reduce((s, p) => s + Number(p.net), 0)),
      collected: String(collected),
      cashCollected: String(cash),
      upiCollected: String(upi),
      cardCollected: String(card),
      otherCollected: String(other),
      balance: String(patients.reduce((s, p) => s + Number(p.balance), 0)),
      expenses: String(expenseTotal),
      cashExpenses: String(cashExpenses),
      cashTakenAway: String(cashTakenAway),
      addedCash: String(addedCash),
      openingCashBalance: String(opening),
      closingCashBalance: String(closing),
      count: patients.length,
    },
    expenses,
    payments,
    cashHandovers: handovers,
    cashAdded: cashAddedEntries,
  };
}

function buildPatient(b: Record<string, unknown>, existing?: DemoPatient): DemoPatient {
  const testIds = (b.testIds as string[]) || [];
  const tests = testIds.map(id => {
    const t = store.tests.find(x => x.id === id)!;
    return { id: uid(), testId: id, rateAtEntry: t?.rate || "0", test: t };
  });
  const total = tests.reduce((s, t) => s + Number(t.rateAtEntry), 0);
  const discount = Number(b.discount) || 0;
  const advanceCash = Number(b.advanceCash) || 0;
  const advanceUpi = Number(b.advanceUpi) || 0;
  const balanceCash = Number(b.balanceCash) || 0;
  const balanceUpi = Number(b.balanceUpi) || 0;
  const net = Math.max(0, total - discount);
  const balance = net - advanceCash - advanceUpi - balanceCash - balanceUpi;
  const today = todayIST();
  const entryDate = existing?.entryDate ?? today;
  const ageValue = Number(b.ageValue ?? b.age) || 0;
  const ageUnit = ((b.ageUnit as AgeUnit) ?? "years") as AgeUnit;
  return {
    id: existing?.id ?? uid(),
    dailySerial: existing?.dailySerial ?? (++store.serial),
    registerNumber: existing?.registerNumber ?? (++store.reg),
    financialYear: existing?.financialYear ?? fyFor(entryDate),
    entryDate,
    name: String(b.name ?? ""), mobile: String(b.mobile ?? ""),
    age: ageUnit === "years" ? ageValue : 0, ageValue, ageUnit,
    sex: (b.sex as Sex) ?? "M",
    referredDoctor: (b.referredDoctor as string) ?? null,
    notes: (b.notes as string) ?? null,
    createdById: existing?.createdById ?? store.currentUserId,
    total: String(total), discount: String(discount), net: String(net),
    advanceCash: String(advanceCash), advanceUpi: String(advanceUpi),
    advancePaidOn: (b.advancePaidOn as string) ?? (advanceCash + advanceUpi > 0 ? today : null),
    balance: String(balance),
    balanceCash: String(balanceCash), balanceUpi: String(balanceUpi),
    balancePaidOn: (b.balancePaidOn as string) ?? (balanceCash + balanceUpi > 0 ? today : null),
    tests,
  };
}

function syncPaymentsFor(patient: DemoPatient) {
  // Remove existing payments for this patient; re-create from buckets.
  store.payments = store.payments.filter(p => p.patientId !== patient.id);
  const buckets: Array<{ amt: number; kind: "advance" | "balance"; mode: PaymentMode; date: string | null }> = [
    { amt: Number(patient.advanceCash), kind: "advance", mode: "cash", date: patient.advancePaidOn },
    { amt: Number(patient.advanceUpi),  kind: "advance", mode: "upi",  date: patient.advancePaidOn },
    { amt: Number(patient.balanceCash), kind: "balance", mode: "cash", date: patient.balancePaidOn },
    { amt: Number(patient.balanceUpi),  kind: "balance", mode: "upi",  date: patient.balancePaidOn },
  ];
  for (const b of buckets) {
    if (b.amt > 0) {
      const date = (b.date || patient.entryDate).slice(0, 10);
      store.payments.push({
        id: uid(), patientId: patient.id, date,
        kind: b.kind, mode: b.mode, amount: String(b.amt),
        notes: null, createdAt: new Date().toISOString(),
        patient: {
          id: patient.id, name: patient.name, mobile: patient.mobile,
          registerNumber: patient.registerNumber, dailySerial: patient.dailySerial,
          entryDate: patient.entryDate, financialYear: patient.financialYear,
        },
      });
    }
  }
}

export function demoHandle(path: string, init: RequestInit = {}): unknown {
  const method = (init.method || "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;

  if (path === "/auth/me") return { id: store.currentUserId, username: "demo", role: "admin" };

  // Tests
  if (path === "/tests" && method === "GET") return store.tests.filter(t => t.active);
  if (path === "/tests" && method === "POST") {
    const name = String(body.name || "").trim();
    const lab = body.outsourced ? String(body.outsourcedLab || "").trim() || null : null;
    const testCode = body.outsourced ? (String(body.testCode || "").trim() || null) : null;
    const dupe = store.tests.find(t =>
      t.name.toLowerCase() === name.toLowerCase() &&
      ((t.outsourcedLab || "INHOUSE").toLowerCase() === (lab || "INHOUSE").toLowerCase()),
    );
    if (dupe) throw new Error("A test with the same name and provider already exists.");
    const t: DemoTest = { id: uid(), name, rate: String(Number(body.rate) || 0), outsourced: !!body.outsourced, outsourcedLab: lab, testCode, active: true };
    store.tests.push(t); return t;
  }

  if (path === "/users" && method === "GET") return store.users;
  if (path === "/users" && method === "POST") {
    const u = { id: uid(), username: body.username, fullName: body.fullName, role: body.role, active: true };
    store.users.push(u); return u;
  }

  if (path.startsWith("/patients/search") && method === "GET") {
    const url = new URL("http://x" + path);
    const q = (url.searchParams.get("q") || "").toLowerCase();
    return store.patients
      .filter(p => p.name.toLowerCase().includes(q) || p.mobile.includes(q) || String(p.registerNumber) === q || String(p.dailySerial) === q)
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.registerNumber - a.registerNumber);
  }

  if (path === "/patients" && method === "POST") {
    const p = buildPatient(body);
    store.patients.push(p);
    syncPaymentsFor(p);
    return p;
  }

  const patientIdMatch = path.match(/^\/patients\/([^/?]+)$/);
  if (patientIdMatch && (method === "PUT" || method === "PATCH")) {
    const id = patientIdMatch[1];
    const idx = store.patients.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const updated = buildPatient(body, store.patients[idx]);
    store.patients[idx] = updated;
    syncPaymentsFor(updated);
    return updated;
  }
  if (patientIdMatch && method === "GET") {
    return store.patients.find(p => p.id === patientIdMatch[1]) || null;
  }

  if (path.startsWith("/ledger")) {
    const clean = path.replace("/today", "");
    const url = new URL("http://x" + clean);
    const date = url.searchParams.get("date") || todayIST();
    return summary(date);
  }

  if (path.startsWith("/expenses") && method === "POST") {
    const e: DemoExpense = { id: uid(), date: todayIST(), description: body.description, amount: String(Number(body.amount) || 0), mode: (body.mode ?? "cash") as PaymentMode, createdAt: new Date().toISOString() };
    store.expenses.push(e); return e;
  }
  const expenseIdMatch = path.match(/^\/expenses\/([^/?]+)$/);
  if (expenseIdMatch && method === "DELETE") {
    store.expenses = store.expenses.filter(e => e.id !== expenseIdMatch[1]);
    return { ok: true };
  }

  // Cash handover
  if (path === "/cash-handover" && method === "POST") {
    const h: CashHandover = {
      id: uid(), date: todayIST(), amount: String(Number(body.amount) || 0),
      notes: body.notes ?? null, createdById: store.currentUserId, createdAt: new Date().toISOString(),
    };
    store.handovers.push(h); return h;
  }
  if (path.startsWith("/cash-handover") && method === "GET") {
    const url = new URL("http://x" + path);
    const date = url.searchParams.get("date") || todayIST();
    return store.handovers.filter(h => h.date === date);
  }
  const handoverIdMatch = path.match(/^\/cash-handover\/([^/?]+)$/);
  if (handoverIdMatch && method === "DELETE") {
    store.handovers = store.handovers.filter(h => h.id !== handoverIdMatch[1]);
    return { ok: true };
  }

  // Payments record (kept minimal for demo)
  if (path === "/payments" && method === "POST") {
    const patient = store.patients.find(p => p.id === body.patientId);
    if (!patient) throw new Error("Patient not found");
    const date = (body.date || todayIST()).slice(0, 10);
    const amt = Number(body.amount) || 0;
    const field = body.kind === "advance"
      ? (body.mode === "cash" ? "advanceCash" : "advanceUpi")
      : (body.mode === "cash" ? "balanceCash" : "balanceUpi");
    (patient as any)[field] = String(Number((patient as any)[field]) + amt);
    if (body.kind === "advance") patient.advancePaidOn = date; else patient.balancePaidOn = date;
    const collected = Number(patient.advanceCash) + Number(patient.advanceUpi) + Number(patient.balanceCash) + Number(patient.balanceUpi);
    patient.balance = String(Number(patient.net) - collected);
    store.payments.push({
      id: uid(), patientId: patient.id, date, kind: body.kind, mode: body.mode, amount: String(amt),
      notes: body.notes ?? null, createdAt: new Date().toISOString(),
      patient: { id: patient.id, name: patient.name, mobile: patient.mobile, registerNumber: patient.registerNumber, dailySerial: patient.dailySerial, entryDate: patient.entryDate, financialYear: patient.financialYear },
    });
    return { patient };
  }

  return null;
}
