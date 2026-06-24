import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useLedger, useCreateExpense, useDeleteExpense, todayKey } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, AlertCircle, CalendarDays } from "lucide-react";
import { PatientFormDialog } from "@/components/patient-form-dialog";
import type { Patient, Expense } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/")({ component: () => <AppShell><Register /></AppShell> });

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {isToday ? "Today's Register" : "Historical Ledger"}
          </div>
          <div className="text-lg font-semibold">{dateStr}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={(e) => setSelectedDate(e.target.value || today)}
              className="bg-transparent text-sm outline-none"
            />
            {!isToday && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedDate(today)}>
                Today
              </Button>
            )}
          </div>
          {isToday && (
            <Button onClick={() => { setEditing(null); setOpen(true); }} size="lg" className="gap-2">
              <Plus className="h-4 w-4" /> Quick Patient Entry <kbd className="ml-2 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px]">N</kbd>
            </Button>
          )}
        </div>
      </div>

      {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && data && (
        <>
          <div className="grid grid-cols-6 gap-3 border-b bg-secondary/30 px-6 py-3 text-sm">
            <Stat label="Opening Balance" value={`₹${Number(data.ledger.openingBalance).toFixed(2)}`} />
            <Stat label="Patients" value={String(data.totals.count)} />
            <Stat label="Net" value={`₹${Number(data.totals.net).toFixed(2)}`} />
            <Stat label="Collected" value={`₹${Number(data.totals.collected).toFixed(2)}`} accent />
            <Stat label="Expenses" value={`₹${Number(data.totals.expenses).toFixed(2)}`} />
            <Stat label="Closing Balance" value={`₹${Number(data.ledger.closingBalance).toFixed(2)}`} accent />
          </div>

          <div className="grid flex-1 grid-cols-12 gap-0 overflow-hidden">
            <div className="col-span-9 flex flex-col overflow-hidden border-r">
              <PatientTable
                patients={data.patients}
                onEdit={(p) => { setEditing(p); setOpen(true); }}
                readOnly={!isToday}
              />
            </div>
            <div className="col-span-3 flex flex-col overflow-hidden">
              <ExpensesPanel
                date={selectedDate}
                expenses={data.expenses}
                totalExpenses={data.totals.expenses}
                readOnly={!isToday}
              />
            </div>
          </div>
        </>
      )}

      <PatientFormDialog open={open} onOpenChange={setOpen} patient={editing} />
      {isToday && <Hotkeys onNew={() => { setEditing(null); setOpen(true); }} />}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function PatientTable({ patients, onEdit, readOnly }: { patients: Patient[]; onEdit: (p: Patient) => void; readOnly?: boolean }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
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
              {readOnly ? "No entries for this date." : <>No entries yet. Press <kbd className="rounded border px-1">N</kbd> to add the first one.</>}
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
                <td className="px-3 py-2">{p.age}/{p.sex}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.tests.map(t => t.test.name).join(", ")}</td>
                <td className="px-3 py-2 text-right tabular-nums">₹{Number(p.net).toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">₹{paid.toFixed(2)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${Number(p.balance) > 0 ? "text-destructive font-medium" : ""}`}>
                  ₹{Number(p.balance).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExpensesPanel({ date, expenses, totalExpenses, readOnly }: { date: string; expenses: Expense[]; totalExpenses: string; readOnly?: boolean }) {
  const create = useCreateExpense();
  const del = useDeleteExpense(date);
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");
  const [mode, setMode] = useState<"cash" | "upi">("cash");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim() || !amt) return;
    await create.mutateAsync({ description: desc.trim(), amount: Number(amt), mode });
    setDesc(""); setAmt("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-secondary/40 px-3 py-2">
        <div className="text-sm font-medium flex items-center gap-2"><AlertCircle className="h-4 w-4" />Expenses</div>
        <div className="text-sm font-semibold tabular-nums">₹{Number(totalExpenses).toFixed(2)}</div>
      </div>
      {!readOnly && (
        <form onSubmit={add} className="space-y-2 border-b p-3">
          <Input placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} className="h-8" />
          <div className="flex gap-2">
            <Input placeholder="Amount" value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" className="h-8" />
            <Select value={mode} onValueChange={(v) => setMode(v as "cash" | "upi")}>
              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" size="sm" className="w-full">Add Expense</Button>
        </form>
      )}
      <div className="flex-1 overflow-auto">
        {expenses.map(e => (
          <div key={e.id} className="flex items-center justify-between border-b px-3 py-2 text-sm">
            <div>
              <div>{e.description}</div>
              <div className="text-xs text-muted-foreground uppercase">{e.mode}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">₹{Number(e.amount).toFixed(2)}</span>
              {!readOnly && (
                <button onClick={() => del.mutate(e.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
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
