import type { AuthState, AuthUser } from "./api";
import { amountInWords } from "./amount-in-words";
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
  whatsappReportRequired: boolean; outsourcedReportReady: boolean;
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
  closedDays: [] as string[],
  users: DEMO_USERS.map(d => ({ id: d.user.id, username: d.user.username, fullName: d.user.fullName, role: d.user.role, active: true })),
  bills: [] as any[],
  billSeq: 0,
  serial: 0,
  reg: 0,
  currentUserId: "demo-admin",
  // -------- Phase 4: tea / coffee (demo parity) --------
  employees: [
    { id: "e1", name: "Prerana", mobile: null, designation: "Receptionist", monthlySalary: "0", active: true, alwaysPresent: true, linkedUserId: null, aadhaarDocumentId: null, aadhaarDocument: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "e2", name: "Gayatri", mobile: null, designation: "Technician", monthlySalary: "0", active: true, alwaysPresent: true, linkedUserId: null, aadhaarDocumentId: null, aadhaarDocument: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ] as any[],
  teaRates: [
    { id: "r1", item: "tea", rate: "10", active: true, effectiveFrom: "2026-08-01" },
    { id: "r2", item: "coffee", rate: "20", active: true, effectiveFrom: "2026-08-01" },
  ] as any[],
  teaEntries: [] as any[],
  teaBills: [] as any[],
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function fyFor(d: string) {
  const [y, m] = d.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const LEDGER_START = "2026-08-01";
const LEDGER_START_OPENING = 1020;

function isSundayStr(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay() === 0;
}

/** Net cash movement for a single date. */
function cashDeltaFor(date: string) {
  const cash = netRows(store.payments.filter(p => p.date === date && p.mode === "cash")).reduce((s, p) => s + Number(p.amount), 0);
  const cashExpenses = store.expenses.filter(e => e.date === date && e.mode === "cash").reduce((s, e) => s + Number(e.amount), 0);
  const takenAway = store.handovers.filter(h => h.date === date).reduce((s, h) => s + Number(h.amount), 0);
  const added = store.cashAdded.filter(c => c.date === date).reduce((s, c) => s + Number(c.amount), 0);
  return cash - cashExpenses - takenAway + added;
}

/** Days explicitly closed (Cash Taken Away recorded, or "Close Day & Carry Forward"). */
function isClosed(date: string) {
  return store.closedDays.includes(date) || store.handovers.some(h => h.date === date);
}

/** Candidate ledger days (any activity or explicit close), ascending. */
function ledgerDays() {
  const dates = new Set<string>([
    LEDGER_START,
    ...store.payments.map(p => p.date),
    ...store.expenses.map(e => e.date),
    ...store.handovers.map(h => h.date),
    ...store.cashAdded.map(c => c.date),
    ...store.closedDays,
  ]);
  return [...dates].filter(d => d >= LEDGER_START && !isSundayStr(d)).sort();
}

/**
 * Opening cash carries forward ONLY from a CLOSED previous day.
 * An open (not carried-forward) day leaves the next day's opening at 0.
 */
function openingFor(date: string) {
  if (date <= LEDGER_START) return LEDGER_START_OPENING;
  let carry: number | null = null;
  for (const d of ledgerDays()) {
    if (d >= date) break;
    const opening: number = d === LEDGER_START ? LEDGER_START_OPENING : (carry ?? 0);
    const closing: number = opening + cashDeltaFor(d);
    carry = isClosed(d) ? closing : null;
  }
  return carry ?? 0;
}

function ledgerFor(date: string) {
  const opening = openingFor(date);
  const closing = opening + cashDeltaFor(date);
  store.ledgers[date] = { openingBalance: String(opening), closingBalance: String(closing) };
  return store.ledgers[date];
}

function summary(date: string) {
  const ledger = ledgerFor(date);
  const patients = store.patients.filter(p => p.entryDate === date).sort((a, b) => a.registerNumber - b.registerNumber);
  const expenses = store.expenses.filter(e => e.date === date);
  const payments = netRows(store.payments.filter(p => p.date === date));
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
  const closing = Number(ledger.closingBalance);


  return {
    date,
    ledger: { id: "demo-ledger-" + date, date, openingBalance: String(opening), closingBalance: String(closing), closedAt: isClosed(date) ? new Date().toISOString() : null, notes: null },
    dayClosed: isClosed(date),
    canCloseDay: !isClosed(date),
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
  // entryDate is NEVER defaulted to today — the caller must send it explicitly.
  const requestedEntryDate = b.entryDate ? String(b.entryDate).slice(0, 10) : "";
  const entryDate = existing?.entryDate ?? requestedEntryDate;
  if (!entryDate) throw new Error("Patient entry date is required.");
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
    whatsappReportRequired: b.whatsappReportRequired !== undefined
      ? !!b.whatsappReportRequired
      : (existing?.whatsappReportRequired ?? false),
    outsourcedReportReady: b.outsourcedReportReady !== undefined
      ? !!b.outsourcedReportReady
      : (existing?.outsourcedReportReady ?? false),
    createdById: existing?.createdById ?? store.currentUserId,
    total: String(total), discount: String(discount), net: String(net),
    advanceCash: String(advanceCash), advanceUpi: String(advanceUpi),
    advancePaidOn: (b.advancePaidOn as string) ?? null,
    balance: String(balance),
    balanceCash: String(balanceCash), balanceUpi: String(balanceUpi),
    balancePaidOn: (b.balancePaidOn as string) ?? null,
    tests,
  };
}

function patientStub(patient: DemoPatient) {
  return {
    id: patient.id, name: patient.name, mobile: patient.mobile,
    registerNumber: patient.registerNumber, dailySerial: patient.dailySerial,
    entryDate: patient.entryDate, financialYear: patient.financialYear,
  };
}

/** Net legacy positive/negative pairs by patient+date+kind+mode; keep positives only. */
function netRows(rows: PaymentRow[]): PaymentRow[] {
  const groups = new Map<string, { row: PaymentRow; sum: number }>();
  for (const r of rows) {
    const key = [r.patientId, r.date, r.kind, r.mode].join("|");
    const g = groups.get(key);
    if (g) g.sum += Number(r.amount);
    else groups.set(key, { row: r, sum: Number(r.amount) });
  }
  return [...groups.values()]
    .filter(g => g.sum > 0)
    .map(g => ({ ...g.row, amount: String(g.sum) }));
}

/** Rebuild the patient's bucket mirrors + balance purely from Payment rows. */
function resyncPatientFromRows(patient: DemoPatient) {
  const rows = netRows(store.payments.filter(p => p.patientId === patient.id));
  let advanceCash = 0, advanceUpi = 0, balanceCash = 0, balanceUpi = 0;
  let advancePaidOn: string | null = null, balancePaidOn: string | null = null;
  for (const r of rows) {
    const a = Number(r.amount);
    if (r.kind === "advance") {
      if (r.mode === "cash") advanceCash += a; else advanceUpi += a;
      if (!advancePaidOn || r.date > advancePaidOn) advancePaidOn = r.date;
    } else {
      if (r.mode === "cash") balanceCash += a; else balanceUpi += a;
      if (!balancePaidOn || r.date > balancePaidOn) balancePaidOn = r.date;
    }
  }
  patient.advanceCash = String(advanceCash);
  patient.advanceUpi = String(advanceUpi);
  patient.balanceCash = String(balanceCash);
  patient.balanceUpi = String(balanceUpi);
  patient.advancePaidOn = advancePaidOn;
  patient.balancePaidOn = balancePaidOn;
  patient.balance = String(Number(patient.net) - (advanceCash + advanceUpi + balanceCash + balanceUpi));
}

/** Create rows from an explicit payments[] array (create flow only). */
function createPaymentsFromInput(patient: DemoPatient, payments: Array<Record<string, unknown>>) {
  for (const p of payments) {
    const amt = Number(p.amount) || 0;
    if (amt <= 0) continue;
    const date = String(p.date || "").slice(0, 10);
    if (!date) throw new Error("Please select a date for every payment.");
    store.payments.push({
      id: uid(), patientId: patient.id, date,
      kind: (p.kind as PaymentRow["kind"]) ?? "advance",
      mode: (p.mode as PaymentMode) ?? "cash",
      amount: String(amt),
      notes: (p.notes as string) ?? null,
      createdAt: new Date().toISOString(),
      patient: patientStub(patient),
    });
  }
  resyncPatientFromRows(patient);
}

/** Legacy fallback: create rows from the advance/balance bucket fields. */
function createPaymentsFromBuckets(patient: DemoPatient) {
  store.payments = store.payments.filter(p => p.patientId !== patient.id);
  const buckets: Array<{ amt: number; kind: "advance" | "balance"; mode: PaymentMode; date: string | null }> = [
    { amt: Number(patient.advanceCash), kind: "advance", mode: "cash", date: patient.advancePaidOn },
    { amt: Number(patient.advanceUpi),  kind: "advance", mode: "upi",  date: patient.advancePaidOn },
    { amt: Number(patient.balanceCash), kind: "balance", mode: "cash", date: patient.balancePaidOn },
    { amt: Number(patient.balanceUpi),  kind: "balance", mode: "upi",  date: patient.balancePaidOn },
  ];
  for (const b of buckets) {
    if (b.amt > 0) {
      store.payments.push({
        id: uid(), patientId: patient.id, date: (b.date || patient.entryDate).slice(0, 10),
        kind: b.kind, mode: b.mode, amount: String(b.amt),
        notes: null, createdAt: new Date().toISOString(),
        patient: patientStub(patient),
      });
    }
  }
  resyncPatientFromRows(patient);
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

  if (path.startsWith("/patients/latest-register") && method === "GET") {
    const url = new URL("http://x" + path);
    const fy = url.searchParams.get("fy") || "";
    const nums = store.patients.filter(p => p.financialYear === fy).map(p => p.registerNumber);
    return { financialYear: fy, registerNumber: nums.length ? Math.max(...nums) : null };
  }

  if (path === "/patients" && method === "POST") {
    const p = buildPatient(body);
    store.patients.push(p);
    // Payment rows come from EITHER payments[] OR the legacy buckets — never both.
    if (Array.isArray(body.payments) && body.payments.length) createPaymentsFromInput(p, body.payments);
    else createPaymentsFromBuckets(p);
    return p;
  }

  const patientIdMatch = path.match(/^\/patients\/([^/?]+)$/);
  if (patientIdMatch && (method === "PUT" || method === "PATCH")) {
    const id = patientIdMatch[1];
    const idx = store.patients.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const updated = buildPatient(body, store.patients[idx]);
    store.patients[idx] = updated;
    // Editing a patient never creates or corrects money rows — only resync.
    resyncPatientFromRows(updated);
    return updated;
  }

  if (patientIdMatch && method === "GET") {
    return store.patients.find(p => p.id === patientIdMatch[1]) || null;
  }

  if (patientIdMatch && method === "DELETE") {
    const id = patientIdMatch[1];
    const target = store.patients.find(p => p.id === id);
    if (!target) throw new Error("Patient not found.");
    const hasNewer = store.patients.some(
      p => p.financialYear === target.financialYear && p.registerNumber > target.registerNumber,
    );
    if (hasNewer) throw new Error("Only the latest patient entry can be deleted.");
    store.patients = store.patients.filter(p => p.id !== id);
    store.payments = store.payments.filter(p => p.patientId !== id);
    store.bills = store.bills.filter((b: any) => b.patientId !== id);
    return { ok: true };
  }

  if (path.startsWith("/ledger") && method === "GET") {
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

  // Close Day & Carry Forward
  if (path.startsWith("/ledger/close") && method === "POST") {
    const url = new URL("http://x" + path);
    const date = url.searchParams.get("date") || todayIST();
    if (!store.closedDays.includes(date)) store.closedDays.push(date);
    return ledgerFor(date);
  }

  // Cash handover
  if (path === "/cash-handover" && method === "POST") {
    const h: CashHandover = {
      id: uid(), date: (body.date || todayIST()).slice(0, 10), amount: String(Number(body.amount) || 0),
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
    const removed = store.handovers.find(h => h.id === handoverIdMatch[1]);
    store.handovers = store.handovers.filter(h => h.id !== handoverIdMatch[1]);
    if (removed && !store.handovers.some(h => h.date === removed.date)) {
      store.closedDays = store.closedDays.filter(d => d !== removed.date);
    }
    return { ok: true };
  }

  // Cash added
  if (path === "/cash-added" && method === "POST") {
    const c: CashAdded = {
      id: uid(), date: (body.date || todayIST()).slice(0, 10), amount: String(Number(body.amount) || 0),
      notes: body.notes ?? null, createdById: store.currentUserId, createdAt: new Date().toISOString(),
    };
    store.cashAdded.push(c); return c;
  }
  if (path.startsWith("/cash-added") && method === "GET") {
    const url = new URL("http://x" + path);
    const date = url.searchParams.get("date") || todayIST();
    return store.cashAdded.filter(c => c.date === date);
  }
  const cashAddedIdMatch = path.match(/^\/cash-added\/([^/?]+)$/);
  if (cashAddedIdMatch && method === "DELETE") {
    store.cashAdded = store.cashAdded.filter(c => c.id !== cashAddedIdMatch[1]);
    return { ok: true };
  }

  // ---- Payment transactions (Payment rows are the single source of truth) ----
  const historyMatch = path.match(/^\/payments\/history\/([^/?]+)$/);
  if (historyMatch && method === "GET") {
    const patientId = historyMatch[1];
    const patient = store.patients.find(p => p.id === patientId);
    const rows = netRows(store.payments.filter(p => p.patientId === patientId))
      .sort((a, b) => a.date.localeCompare(b.date));
    const net = Number(patient?.net ?? 0);
    const totalPaid = rows.reduce((s, r) => s + Number(r.amount), 0);
    return {
      patientId,
      net: String(net),
      totalPaid: String(totalPaid),
      pending: String(Math.max(0, net - totalPaid)),
      overpaid: String(Math.max(0, totalPaid - net)),
      payments: rows,
    };
  }

  const byPatientMatch = path.match(/^\/payments\/patient\/([^/?]+)$/);
  if (byPatientMatch && method === "GET") {
    return netRows(store.payments.filter(p => p.patientId === byPatientMatch[1]))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  if (path === "/payments" && method === "POST") {
    const patient = store.patients.find(p => p.id === body.patientId);
    if (!patient) throw new Error("Patient not found");
    const date = String(body.date || "").slice(0, 10);
    if (!date) throw new Error("Please select the payment date.");
    const amt = Number(body.amount) || 0;
    if (amt <= 0) throw new Error("Payment amount must be greater than 0.");
    const row: PaymentRow = {
      id: uid(), patientId: patient.id, date,
      kind: body.kind, mode: body.mode, amount: String(amt),
      notes: body.notes ?? null, createdAt: new Date().toISOString(),
      patient: patientStub(patient),
    };
    store.payments.push(row);
    resyncPatientFromRows(patient);
    return row;
  }

  const paymentIdMatch = path.match(/^\/payments\/([^/?]+)$/);
  if (paymentIdMatch && method === "PUT") {
    const row = store.payments.find(p => p.id === paymentIdMatch[1]);
    if (!row) throw new Error("Payment not found");
    // Edit the SAME row in place — no negative correction rows are ever created.
    if (body.date) row.date = String(body.date).slice(0, 10);
    if (body.kind) row.kind = body.kind;
    if (body.mode) row.mode = body.mode;
    if (body.amount !== undefined) {
      const amt = Number(body.amount) || 0;
      if (amt <= 0) throw new Error("Payment amount must be greater than 0.");
      row.amount = String(amt);
    }
    if (body.notes !== undefined) row.notes = body.notes ?? null;
    const patient = store.patients.find(p => p.id === row.patientId);
    if (patient) resyncPatientFromRows(patient);
    return row;
  }

  if (paymentIdMatch && method === "DELETE") {
    const row = store.payments.find(p => p.id === paymentIdMatch[1]);
    store.payments = store.payments.filter(p => p.id !== paymentIdMatch[1]);
    const patient = row && store.patients.find(p => p.id === row.patientId);
    if (patient) resyncPatientFromRows(patient);
    return { ok: true };
  }


  // ---- Phase 3: bills (manual generation only) ----
  if (path.startsWith("/bills")) {
    const byPatient = path.match(/^\/bills\/by-patient\/([^/?]+)$/);
    if (byPatient && method === "GET") return store.bills.find(b => b.patientId === byPatient[1]) ?? null;

    const gen = path.match(/^\/bills\/generate\/([^/?]+)$/);
    if (gen && method === "POST") {
      const existing = store.bills.find(b => b.patientId === gen[1]);
      if (existing) return existing;
      const patient = store.patients.find(p => p.id === gen[1]);
      if (!patient) throw new Error("Patient not found");
      const paid = Number(patient.advanceCash) + Number(patient.advanceUpi) + Number(patient.balanceCash) + Number(patient.balanceUpi);
      const bill = {
        id: uid(), billNumber: ++store.billSeq, financialYear: fyFor(todayIST()),
        billDate: todayIST(), patientId: patient.id,
        patientRegisterNumberSnapshot: patient.registerNumber,
        patientFinancialYearSnapshot: patient.financialYear,
        patientNameSnapshot: patient.name,
        patientAgeSnapshot: `${patient.ageValue} ${patient.ageUnit}`,
        patientSexSnapshot: patient.sex,
        patientMobileSnapshot: patient.mobile || null,
        referredDoctorSnapshot: patient.referredDoctor,
        totalAmount: patient.total, discount: patient.discount, netAmount: patient.net,
        paidAmount: String(paid), balanceAmount: patient.balance,
        amountInWords: amountInWords(Number(patient.net)),
        createdById: store.currentUserId, printedAt: null, printedById: null, printCount: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        items: patient.tests.map((t, i) => ({
          id: uid(), billId: "", sortOrder: i + 1, testName: t.test.name,
          testCode: t.test.testCode ?? null,
          outsourcedLab: t.test.outsourced ? t.test.outsourcedLab ?? null : null,
          rate: t.rateAtEntry, quantity: 1, amount: t.rateAtEntry,
        })),
      };
      store.bills.push(bill);
      return bill;
    }

    const printed = path.match(/^\/bills\/([^/?]+)\/mark-printed$/);
    if (printed && method === "POST") {
      const b = store.bills.find(x => x.id === printed[1]);
      if (!b) throw new Error("Bill not found");
      b.printCount += 1; b.printedAt = new Date().toISOString(); b.printedById = store.currentUserId;
      return b;
    }

    const one = path.match(/^\/bills\/([^/?]+)(\/print)?$/);
    if (one && method === "GET" && one[1] !== "by-patient") {
      const b = store.bills.find(x => x.id === one[1]);
      if (b) return b;
    }

    if (method === "GET") {
      const url = new URL("http://x" + path);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const bn = url.searchParams.get("billNumber");
      return store.bills
        .filter(b => (!from || b.billDate >= from) && (!to || b.billDate <= to)
          && (!q || b.patientNameSnapshot.toLowerCase().includes(q))
          && (!bn || String(b.billNumber) === bn))
        .sort((a, b) => b.billNumber - a.billNumber);
    }
  }

    // ---- Phase 4: tea / coffee ----
  if (path === "/employees" && method === "GET") return store.employees.filter((e: any) => e.active);

  if (path.startsWith("/tea-coffee")) {
    const url = new URL("http://x" + path);
    const clean = url.pathname;
    const monthLabel = (m: string) => {
      const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const [y, mm] = m.split("-").map(Number);
      return `${names[mm - 1]} ${y}`;
    };
    const rateFor = (item: string) => Number(store.teaRates.find((r: any) => r.item === item)?.rate ?? 0);

    if (clean === "/tea-coffee/rates" && method === "GET") return store.teaRates;
    if (clean === "/tea-coffee/rates" && method === "PUT") {
      const r = store.teaRates.find((x: any) => x.item === body.item);
      if (r) r.rate = String(Number(body.rate) || 0);
      return r;
    }

    if (clean === "/tea-coffee/entries" && method === "GET") {
      const date = url.searchParams.get("date") || todayIST();
      const entries = store.teaEntries.filter((e: any) => e.date === date);
      return {
        date,
        entries,
        totals: {
          teaQty: entries.filter((e: any) => e.item === "tea").reduce((s: number, e: any) => s + e.quantity, 0),
          coffeeQty: entries.filter((e: any) => e.item === "coffee").reduce((s: number, e: any) => s + e.quantity, 0),
          totalAmount: entries.reduce((s: number, e: any) => s + Number(e.amount), 0).toFixed(2),
        },
      };
    }

    if (clean === "/tea-coffee/entries" && method === "POST") {
      const employee = store.employees.find((e: any) => e.id === body.employeeId);
      if (!employee) throw new Error("Employee not found");
      const quantity = Math.max(1, Number(body.quantity) || 1);
      const rate = rateFor(body.item);
      const row = {
        id: uid(), date: (body.date || todayIST()).slice(0, 10), employeeId: body.employeeId,
        item: body.item, quantity, rateAtTime: String(rate), amount: String(rate * quantity),
        createdById: store.currentUserId,
        employee: { id: employee.id, name: employee.name, designation: employee.designation },
      };
      store.teaEntries.push(row);
      return row;
    }

    const teaEntryMatch = clean.match(/^\/tea-coffee\/entries\/([^/?]+)$/);
    if (teaEntryMatch && method === "PUT") {
      const row = store.teaEntries.find((e: any) => e.id === teaEntryMatch[1]);
      if (!row) throw new Error("Entry not found");
      if (body.employeeId) {
        const emp = store.employees.find((e: any) => e.id === body.employeeId);
        row.employeeId = body.employeeId;
        row.employee = emp ? { id: emp.id, name: emp.name, designation: emp.designation } : row.employee;
      }
      if (body.item) row.item = body.item;
      if (body.date) row.date = String(body.date).slice(0, 10);
      if (body.quantity != null) row.quantity = Math.max(1, Number(body.quantity) || 1);
      row.rateAtTime = String(rateFor(row.item));
      row.amount = String(Number(row.rateAtTime) * row.quantity);
      return row;
    }
    if (teaEntryMatch && method === "DELETE") {
      store.teaEntries = store.teaEntries.filter((e: any) => e.id !== teaEntryMatch[1]);
      return { ok: true };
    }

    const billFor = (month: string) => {
      const rows = store.teaEntries.filter((e: any) => e.date.slice(0, 7) === month);
      const teaCount = rows.filter((e: any) => e.item === "tea").reduce((s: number, e: any) => s + e.quantity, 0);
      const coffeeCount = rows.filter((e: any) => e.item === "coffee").reduce((s: number, e: any) => s + e.quantity, 0);
      const teaAmount = rows.filter((e: any) => e.item === "tea").reduce((s: number, e: any) => s + Number(e.amount), 0);
      const coffeeAmount = rows.filter((e: any) => e.item === "coffee").reduce((s: number, e: any) => s + Number(e.amount), 0);
      const stored = store.teaBills.find((b: any) => b.billMonth === month);
      const paid = stored?.status === "paid";
      const expense = stored?.expenseId ? store.expenses.find(e => e.id === stored.expenseId) ?? null : null;
      return {
        id: stored?.id ?? null,
        billMonth: month,
        billMonthLabel: monthLabel(month),
        teaCount: paid ? stored.teaCount : teaCount,
        coffeeCount: paid ? stored.coffeeCount : coffeeCount,
        teaAmount: (paid ? Number(stored.teaAmount) : teaAmount).toFixed(2),
        coffeeAmount: (paid ? Number(stored.coffeeAmount) : coffeeAmount).toFixed(2),
        totalAmount: (paid ? Number(stored.totalAmount) : teaAmount + coffeeAmount).toFixed(2),
        liveTotalAmount: (teaAmount + coffeeAmount).toFixed(2),
        status: stored?.status ?? "unpaid",
        paidDate: stored?.paidDate ?? null,
        paidAmount: stored?.paidAmount ?? null,
        notes: stored?.notes ?? null,
        expenseId: stored?.expenseId ?? null,
        expense: expense ? { id: expense.id, date: expense.date, description: expense.description, amount: expense.amount, mode: expense.mode } : null,
      };
    };

    if (clean === "/tea-coffee/monthly-bill" && method === "GET") {
      return billFor(url.searchParams.get("month") || todayIST().slice(0, 7));
    }

    if (clean === "/tea-coffee/monthly-bill/mark-paid" && method === "POST") {
      const month = String(body.billMonth);
      const current = billFor(month);
      if (current.status === "paid") throw new Error(`Tea/Coffee bill for ${current.billMonthLabel} is already paid.`);
      const paidDate = String(body.paidDate || "").slice(0, 10);
      if (!paidDate) throw new Error("Paid date is required.");
      if (paidDate < LEDGER_START) throw new Error("Ledger entries are allowed only from 01-Aug-2026 onward.");
      if (isSundayStr(paidDate)) throw new Error("Sunday / Clinic Holiday. Ledger entries are blocked for this date.");
      const amount = Number(body.paidAmount ?? current.liveTotalAmount);
      if (!(amount > 0)) throw new Error("Paid amount must be greater than 0.");
      const bill: any = {
        id: uid(), billMonth: month,
        teaCount: current.teaCount, coffeeCount: current.coffeeCount,
        teaAmount: current.teaAmount, coffeeAmount: current.coffeeAmount,
        totalAmount: current.liveTotalAmount,
        status: "paid", paidDate, paidAmount: amount.toFixed(2),
        notes: body.notes ?? null, expenseId: null,
      };
      const expense: DemoExpense = {
        id: uid(), date: paidDate,
        description: `Tea/Coffee bill for month ${current.billMonthLabel} with bill id ${bill.id}`,
        amount: amount.toFixed(2), mode: "cash", createdAt: new Date().toISOString(),
      };
      store.expenses.push(expense);
      bill.expenseId = expense.id;
      store.teaBills.push(bill);
      return billFor(month);
    }
  }

  return null;
}
