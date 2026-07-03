import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  useLedger, useCreateExpense, useDeleteExpense, todayKey,
  useCreateCashHandover, useDeleteCashHandover,
} from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, AlertCircle, CalendarDays, HandCoins, ArrowRightCircle } from "lucide-react";
import { PatientFormDialog } from "@/components/patient-form-dialog";
import type { CashHandover, Expense, Patient, PaymentMode, PaymentRow } from "@/lib/types";
import { formatAge } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: () => <AppShell><Register /></AppShell> });

const MIN_ENTRY_DATE = "2026-04-01";

function Register() {
  const today = todayKey();
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const isToday = selectedDate === today;
  const { data, isLoading, error } = useLedger(selectedDate);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);

  if (error) return <div className="p-6 text-sm text-destructive">Failed to load. Is the backend running on {import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}?</div>;

  const dateStr = new Date(selectedDate + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
  const shortDateStr = new Date(selectedDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });

  const balancePayments = (data?.payments ?? []).filter(
    (p) => p.kind === "balance" && (p.patient ? p.patient.entryDate.slice(0, 10) !== selectedDate : true),
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {isToday ? "Today's Register" : "Ledger"}
          </div>
          <div className="text-lg font-semibold">{dateStr}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              min={MIN_ENTRY_DATE}
              onChange={(e) => setSelectedDate(e.target.value || today)}
              className="bg-transparent text-sm outline-none"
            />
            {!isToday && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedDate(today)}>
                Today
              </Button>
            )}
          </div>
          <Button onClick={() => { setEditing(null); setOpen(true); }} size="lg" className="gap-2">
            <Plus className="h-4 w-4" /> Add Patient {isToday && <kbd className="ml-2 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px]">N</kbd>}
          </Button>
        </div>
      </div>

      {!isToday && (
        <div className="flex items-center gap-2 border-b bg-amber-50 px-6 py-2 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4" />
          Entries will be saved for: <span className="font-semibold">{shortDateStr}</span>
        </div>
      )}

      {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && data && (
        <>
          {/* Cash + collection split summary */}
          <div className="grid grid-cols-5 gap-3 border-b bg-secondary/30 px-6 py-3 text-sm">
            <Stat label="Opening Cash" value={money(data.totals.openingCashBalance)} />
            <Stat label="Cash Collected" value={money(data.totals.cashCollected)} accent />
            <Stat label="UPI Collected" value={money(data.totals.upiCollected)} />
            <Stat label="Card Collected" value={money(data.totals.cardCollected)} />
            <Stat label="Total Collected" value={money(data.totals.collected)} accent />
            <Stat label="Cash Expenses" value={money(data.totals.cashExpenses)} />
            <Stat label="Cash Taken Away" value={money(data.totals.cashTakenAway)} />
            <Stat label="Net Billing" value={money(data.totals.net)} />
            <Stat label="Pending Balance" value={money(data.totals.balance)} />
            <Stat label="Closing Cash" value={money(data.totals.closingCashBalance)} accent />
          </div>

          <div className="grid flex-1 grid-cols-12 gap-0 overflow-hidden">
            <div className="col-span-8 flex flex-col overflow-auto border-r">
              <PatientTable
                patients={data.patients}
                onEdit={(p) => { setEditing(p); setOpen(true); }}
              />
              <BalanceReceivedPanel rows={balancePayments} />
            </div>
            <div className="col-span-4 flex flex-col overflow-auto">
              <CashHandoverPanel
                date={selectedDate}
                handovers={data.cashHandovers}
                total={data.totals.cashTakenAway}
              />
              <ExpensesPanel
                date={selectedDate}
                expenses={data.expenses}
                totalExpenses={data.totals.expenses}
              />
            </div>
          </div>
        </>
      )}

      <PatientFormDialog
        open={open}
        onOpenChange={setOpen}
        patient={editing}
        entryDate={!editing && !isToday ? selectedDate : undefined}
      />
      {isToday && <Hotkeys onNew={() => { setEditing(null); setOpen(true); }} />}
    </div>
  );
}

function money(v: string | number) { return `₹${Number(v).toFixed(2)}`; }

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", accent && "text-primary")}>{value}</div>
    </div>
  );
}

function PatientTable({ patients, onEdit }: { patients: Patient[]; onEdit: (p: Patient) => void }) {
  return (
    <div className="overflow-auto">
      <div className="sticky top-0 z-10 border-b bg-secondary px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Patients Registered
      </div>
      <table className="w-full text-sm">
        <thead className="sticky top-9 bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Reg #</th>
            <th className="px-3 py-2 text-left">FY</th>
            <th className="px-3 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-left">Mobile</th>
            <th className="px-3 py-2 text-left">Age/Sex</th>
            <th className="px-3 py-2 text-left">Tests</th>
            <th className="px-3 py-2 text-right">Net</th>
            <th className="px-3 py-2 text-right">Paid</th>
            <th className="px-3 py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {patients.length === 0 && (
            <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">
              No entries yet. Click <span className="font-medium">Add Patient</span> to add the first one.
            </td></tr>
          )}
          {patients.map(p => {
            const paid = Number(p.advanceCash) + Number(p.advanceUpi) + Number(p.balanceCash) + Number(p.balanceUpi);
            return (
              <tr key={p.id} onClick={() => onEdit(p)} className="cursor-pointer border-b hover:bg-secondary/40">
                <td className="px-3 py-2 font-mono">{p.registerNumber ?? p.dailySerial}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.financialYear ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {p.notes && <span title={p.notes} className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--notes-indicator)" }} />}
                    <span className="font-medium">{p.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2">{p.mobile}</td>
                <td className="px-3 py-2">{formatAge(p)} · {p.sex}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.tests.map(t => t.test.name).join(", ")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(p.net)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(paid)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${Number(p.balance) > 0 ? "text-destructive font-medium" : ""}`}>
                  {money(p.balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BalanceReceivedPanel({ rows }: { rows: PaymentRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="border-t">
      <div className="flex items-center gap-2 border-b bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
        <ArrowRightCircle className="h-4 w-4" /> Balance Received Today (from previous days)
      </div>
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Patient</th>
            <th className="px-3 py-2 text-left">Reg #</th>
            <th className="px-3 py-2 text-left">FY</th>
            <th className="px-3 py-2 text-left">Original Date</th>
            <th className="px-3 py-2 text-left">Mode</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b">
              <td className="px-3 py-2 font-medium">{r.patient?.name ?? "—"}</td>
              <td className="px-3 py-2 font-mono">{r.patient?.registerNumber ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.patient?.financialYear ?? "—"}</td>
              <td className="px-3 py-2">{r.patient?.entryDate?.slice(0, 10) ?? "—"}</td>
              <td className="px-3 py-2 uppercase text-xs">{r.mode}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CashHandoverPanel({ date, handovers, total }: { date: string; handovers: CashHandover[]; total: string }) {
  const create = useCreateCashHandover(date);
  const del = useDeleteCashHandover(date);
  const [amt, setAmt] = useState("");
  const [notes, setNotes] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!amt) return;
    await create.mutateAsync({ amount: Number(amt), notes: notes.trim() || undefined });
    setAmt(""); setNotes("");
  }

  return (
    <div className="border-b">
      <div className="flex items-center justify-between border-b bg-secondary/40 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium"><HandCoins className="h-4 w-4" /> Cash Taken Away</div>
        <div className="text-sm font-semibold tabular-nums">{money(total)}</div>
      </div>
      <form onSubmit={add} className="space-y-2 border-b p-3">
        <Input placeholder="Amount" value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" className="h-8" />
        <Input placeholder="Notes (e.g. handed to Dr. Mam)" value={notes} onChange={e => setNotes(e.target.value)} className="h-8" />
        <Button type="submit" size="sm" className="w-full">Add Cash Taken Away</Button>
      </form>
      <div>
        {handovers.map(h => (
          <div key={h.id} className="flex items-center justify-between border-b px-3 py-2 text-sm">
            <div>
              <div className="tabular-nums font-medium">{money(h.amount)}</div>
              {h.notes && <div className="text-xs text-muted-foreground">{h.notes}</div>}
            </div>
            <button onClick={() => del.mutate(h.id)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {handovers.length === 0 && <div className="p-3 text-xs text-muted-foreground">No cash taken away.</div>}
      </div>
    </div>
  );
}

function ExpensesPanel({ date, expenses, totalExpenses }: { date: string; expenses: Expense[]; totalExpenses: string }) {
  const create = useCreateExpense(date);
  const del = useDeleteExpense(date);
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim() || !amt) return;
    await create.mutateAsync({ description: desc.trim(), amount: Number(amt), mode });
    setDesc(""); setAmt("");
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b bg-secondary/40 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium"><AlertCircle className="h-4 w-4" /> Expenses</div>
        <div className="text-sm font-semibold tabular-nums">{money(totalExpenses)}</div>
      </div>
      <form onSubmit={add} className="space-y-2 border-b p-3">
        <Input placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} className="h-8" />
        <div className="flex gap-2">
          <Input placeholder="Amount" value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" className="h-8" />
          <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" className="w-full">Add Expense</Button>
      </form>
      <div>
        {expenses.map(e => (
          <div key={e.id} className="flex items-center justify-between border-b px-3 py-2 text-sm">
            <div>
              <div>{e.description}</div>
              <div className="text-xs uppercase text-muted-foreground">{e.mode}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{money(e.amount)}</span>
              <button onClick={() => del.mutate(e.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {expenses.length === 0 && <div className="p-3 text-xs text-muted-foreground">No expenses.</div>}
      </div>
    </div>
  );
}

function Hotkeys({ onNew }: { onNew: () => void }) {
  useState(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "n" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault(); onNew();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  return null;
}
