import type { AuthState, AuthUser } from "./api";

// Local demo users so the UI is usable in Lovable preview without the NestJS backend.
// These mirror the seed file (backend/prisma/seed.ts).
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

// Minimal in-memory data so screens render. Replaced by real backend when present.
const today = new Date().toISOString().slice(0, 10);

interface DemoTest { id: string; name: string; rate: string; outsourced: boolean; outsourcedLab?: string | null; active: boolean }
interface DemoPatient {
  id: string; dailySerial: number; entryDate: string; name: string; mobile: string; age: number; sex: "M" | "F" | "O";
  referredDoctor: string | null; notes: string | null;
  total: string; discount: string; net: string;
  advanceCash: string; advanceUpi: string; advancePaidOn: string | null;
  balance: string; balanceCash: string; balanceUpi: string; balancePaidOn: string | null;
  tests: Array<{ id: string; testId: string; rateAtEntry: string; test: DemoTest }>;
}
interface DemoExpense { id: string; date: string; description: string; amount: string; mode: "cash" | "upi"; createdAt: string }

const store = {
  tests: [
    { id: "t1", name: "CBC", rate: "250", outsourced: false, active: true },
    { id: "t2", name: "Blood Sugar (Fasting)", rate: "80", outsourced: false, active: true },
    { id: "t3", name: "Lipid Profile", rate: "600", outsourced: false, active: true },
    { id: "t4", name: "Thyroid (T3, T4, TSH)", rate: "450", outsourced: false, active: true },
    { id: "t5", name: "HbA1c", rate: "350", outsourced: false, active: true },
    { id: "t6", name: "Vitamin D", rate: "1200", outsourced: true, outsourcedLab: "Metro Diagnostics", active: true },
  ] as DemoTest[],
  patients: [] as DemoPatient[],
  expenses: [] as DemoExpense[],
  users: DEMO_USERS.map(d => ({ id: d.user.id, username: d.user.username, fullName: d.user.fullName, role: d.user.role, active: true })),
  serial: 0,
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function sumPatient(p: DemoPatient) {
  const collected = Number(p.advanceCash) + Number(p.advanceUpi) + Number(p.balanceCash) + Number(p.balanceUpi);
  return { collected, due: Math.max(0, Number(p.net) - collected) };
}

function todayResponse(date = today) {
  const patients = store.patients.filter(p => p.entryDate === date);
  const expenses = store.expenses.filter(e => e.date === date);
  const total = patients.reduce((s, p) => s + Number(p.total), 0);
  const discount = patients.reduce((s, p) => s + Number(p.discount), 0);
  const net = patients.reduce((s, p) => s + Number(p.net), 0);
  const collected = patients.reduce((s, p) => s + sumPatient(p).collected, 0);
  const balance = patients.reduce((s, p) => s + Number(p.balance), 0);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const openingBalance = 0;
  const closingBalance = openingBalance + collected - expenseTotal;
  return {
    date,
    ledger: { id: "demo-ledger", date, openingBalance: String(openingBalance), closingBalance: String(closingBalance), notes: null },
    patients: patients.sort((a, b) => a.dailySerial - b.dailySerial),
    totals: {
      total: String(total), discount: String(discount), net: String(net), collected: String(collected),
      balance: String(balance), expenses: String(expenseTotal), count: patients.length,
    },
    expenses,
  };
}

export function demoHandle(path: string, init: RequestInit = {}): unknown {
  const method = (init.method || "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;

  // /auth/me
  if (path === "/auth/me") return { id: "demo", username: "demo", role: "admin" };

  // /tests
  if (path === "/tests" && method === "GET") return store.tests.filter(t => t.active);
  if (path === "/tests" && method === "POST") {
    const t: DemoTest = { id: uid(), name: body.name, rate: String(Number(body.rate) || 0), outsourced: !!body.outsourced, outsourcedLab: body.outsourcedLab ?? null, active: true };
    store.tests.push(t); return t;
  }

  // /users
  if (path === "/users" && method === "GET") return store.users;
  if (path === "/users" && method === "POST") {
    const u = { id: uid(), username: body.username, fullName: body.fullName, role: body.role, active: true };
    store.users.push(u); return u;
  }

  // /patients/search?q=...
  if (path.startsWith("/patients/search") && method === "GET") {
    const url = new URL("http://x" + path);
    const q = (url.searchParams.get("q") || "").toLowerCase();
    return store.patients
      .filter(p => p.name.toLowerCase().includes(q) || p.mobile.includes(q) || String(p.dailySerial) === q)
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.dailySerial - a.dailySerial);
  }

  // /patients?date=YYYY-MM-DD
  if (path.startsWith("/patients") && method === "GET") {
    const url = new URL("http://x" + path);
    const date = url.searchParams.get("date") || today;
    const q = (url.searchParams.get("q") || "").toLowerCase();
    let rows = store.patients.filter(p => p.entryDate === date || !url.searchParams.get("date"));
    if (q) rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.mobile.includes(q));
    return rows.sort((a, b) => a.dailySerial - b.dailySerial);
  }
  if (path === "/patients" && method === "POST") {
    store.serial += 1;
    const tests = (body.testIds as string[] || []).map(id => {
      const t = store.tests.find(x => x.id === id)!;
      return { id: uid(), testId: id, rateAtEntry: t?.rate || "0", test: t };
    });
    const total = tests.reduce((s, t) => s + Number(t.rateAtEntry), 0);
    const discount = Number(body.discount) || 0;
    const advanceCash = Number(body.advanceCash) || 0;
    const advanceUpi = Number(body.advanceUpi) || 0;
    const balanceCash = Number(body.balanceCash) || 0;
    const balanceUpi = Number(body.balanceUpi) || 0;
    const net = Math.max(0, total - discount);
    const p: DemoPatient = {
      id: uid(), dailySerial: store.serial, entryDate: today,
      name: body.name, mobile: body.mobile, age: Number(body.age) || 0, sex: body.sex ?? "M",
      referredDoctor: body.referredDoctor ?? null, notes: body.notes ?? null,
      total: String(total), discount: String(discount), net: String(net),
      advanceCash: String(advanceCash), advanceUpi: String(advanceUpi), advancePaidOn: body.advancePaidOn ?? null,
      balance: String(net - advanceCash - advanceUpi - balanceCash - balanceUpi),
      balanceCash: String(balanceCash), balanceUpi: String(balanceUpi), balancePaidOn: body.balancePaidOn ?? null,
      tests,
    };
    store.patients.push(p);
    return p;
  }

  // /ledger/today or /ledger?date=
  if (path.startsWith("/ledger")) {
    const url = new URL("http://x" + path.replace("/today", ""));
    const date = url.searchParams.get("date") || today;
    return todayResponse(date);
  }

  // /expenses
  if (path.startsWith("/expenses") && method === "GET") {
    const url = new URL("http://x" + path);
    const date = url.searchParams.get("date") || today;
    return store.expenses.filter(e => e.date === date);
  }
  if (path === "/expenses" && method === "POST") {
    const e: DemoExpense = { id: uid(), date: today, description: body.description, amount: String(Number(body.amount) || 0), mode: body.mode ?? "cash", createdAt: new Date().toISOString() };
    store.expenses.push(e); return e;
  }

  return null;
}
