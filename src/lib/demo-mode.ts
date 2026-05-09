import type { AuthState, AuthUser, Role } from "./api";

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

interface DemoTest { id: string; name: string; rate: number; outsourced: boolean; outsourcedLab?: string | null; active: boolean }
interface DemoPatient {
  id: string; dailySerial: number; date: string; fullName: string; age: number | null; sex: string | null;
  phone: string | null; referredBy: string | null; notes: string | null;
  totalAmount: number; discount: number; netAmount: number;
  advanceCash: number; advanceUpi: number; advanceCard: number; advanceCheque: number;
  balanceCash: number; balanceUpi: number; balanceCard: number; balanceCheque: number;
  outsourcedPaid: number;
  tests: Array<{ id: string; testId: string; testName: string; rate: number }>;
}
interface DemoExpense { id: string; date: string; description: string; amount: number; createdAt: string }

const store = {
  tests: [
    { id: "t1", name: "CBC", rate: 250, outsourced: false, active: true },
    { id: "t2", name: "Blood Sugar (Fasting)", rate: 80, outsourced: false, active: true },
    { id: "t3", name: "Lipid Profile", rate: 600, outsourced: false, active: true },
    { id: "t4", name: "Thyroid (T3, T4, TSH)", rate: 450, outsourced: false, active: true },
    { id: "t5", name: "HbA1c", rate: 350, outsourced: false, active: true },
    { id: "t6", name: "Vitamin D", rate: 1200, outsourced: true, outsourcedLab: "Metro Diagnostics", active: true },
  ] as DemoTest[],
  patients: [] as DemoPatient[],
  expenses: [] as DemoExpense[],
  users: DEMO_USERS.map(d => ({ id: d.user.id, username: d.user.username, fullName: d.user.fullName, role: d.user.role, active: true })),
  serial: 0,
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function sumPatient(p: DemoPatient) {
  const collected = p.advanceCash + p.advanceUpi + p.advanceCard + p.advanceCheque
                  + p.balanceCash + p.balanceUpi + p.balanceCard + p.balanceCheque;
  return { collected, due: Math.max(0, p.netAmount - collected) };
}

export function demoHandle(path: string, init: RequestInit = {}): unknown {
  const method = (init.method || "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;

  // /auth/me
  if (path === "/auth/me") return { id: "demo", username: "demo", role: "admin" };

  // /tests
  if (path === "/tests" && method === "GET") return store.tests.filter(t => t.active);
  if (path === "/tests" && method === "POST") {
    const t: DemoTest = { id: uid(), name: body.name, rate: Number(body.rate) || 0, outsourced: !!body.outsourced, outsourcedLab: body.outsourcedLab ?? null, active: true };
    store.tests.push(t); return t;
  }

  // /users
  if (path === "/users" && method === "GET") return store.users;
  if (path === "/users" && method === "POST") {
    const u = { id: uid(), username: body.username, fullName: body.fullName, role: body.role, active: true };
    store.users.push(u); return u;
  }

  // /patients?date=YYYY-MM-DD
  if (path.startsWith("/patients") && method === "GET") {
    const url = new URL("http://x" + path);
    const date = url.searchParams.get("date") || today;
    const q = (url.searchParams.get("q") || "").toLowerCase();
    let rows = store.patients.filter(p => p.date === date || !url.searchParams.get("date"));
    if (q) rows = rows.filter(p => p.fullName.toLowerCase().includes(q) || (p.phone || "").includes(q));
    return rows.sort((a, b) => a.dailySerial - b.dailySerial);
  }
  if (path === "/patients" && method === "POST") {
    store.serial += 1;
    const tests = (body.testIds as string[] || []).map(id => {
      const t = store.tests.find(x => x.id === id)!;
      return { id: uid(), testId: id, testName: t?.name || "?", rate: t?.rate || 0 };
    });
    const total = body.totalAmount ?? tests.reduce((s, t) => s + t.rate, 0);
    const discount = Number(body.discount) || 0;
    const p: DemoPatient = {
      id: uid(), dailySerial: store.serial, date: today,
      fullName: body.fullName, age: body.age ?? null, sex: body.sex ?? null,
      phone: body.phone ?? null, referredBy: body.referredBy ?? null, notes: body.notes ?? null,
      totalAmount: total, discount, netAmount: total - discount,
      advanceCash: +body.advanceCash || 0, advanceUpi: +body.advanceUpi || 0, advanceCard: +body.advanceCard || 0, advanceCheque: +body.advanceCheque || 0,
      balanceCash: +body.balanceCash || 0, balanceUpi: +body.balanceUpi || 0, balanceCard: +body.balanceCard || 0, balanceCheque: +body.balanceCheque || 0,
      outsourcedPaid: +body.outsourcedPaid || 0,
      tests,
    };
    store.patients.push(p);
    return p;
  }

  // /ledger/today or /ledger?date=
  if (path.startsWith("/ledger")) {
    const url = new URL("http://x" + path.replace("/today", ""));
    const date = url.searchParams.get("date") || today;
    const dayPatients = store.patients.filter(p => p.date === date);
    const collected = dayPatients.reduce((s, p) => s + sumPatient(p).collected, 0);
    const expenses = store.expenses.filter(e => e.date === date).reduce((s, e) => s + e.amount, 0);
    const opening = 0;
    const net = collected - expenses;
    return { date, openingBalance: opening, totalCollected: collected, totalExpenses: expenses, netForDay: net, closingBalance: opening + net };
  }

  // /expenses
  if (path.startsWith("/expenses") && method === "GET") {
    const url = new URL("http://x" + path);
    const date = url.searchParams.get("date") || today;
    return store.expenses.filter(e => e.date === date);
  }
  if (path === "/expenses" && method === "POST") {
    const e: DemoExpense = { id: uid(), date: today, description: body.description, amount: Number(body.amount) || 0, createdAt: new Date().toISOString() };
    store.expenses.push(e); return e;
  }

  return null;
}
