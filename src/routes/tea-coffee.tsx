import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  useEmployees,
  useTeaCoffeeRates,
  useTeaCoffeeDay,
  useCreateTeaCoffeeEntry,
  useUpdateTeaCoffeeEntry,
  useDeleteTeaCoffeeEntry,
  useTeaCoffeeMonthlyBill,
  useMarkTeaCoffeeBillPaid,
  todayKey,
} from "@/lib/queries";
import type { TeaCoffeeItem } from "@/lib/types";

export const Route = createFileRoute("/tea-coffee")({
  head: () => ({
    meta: [
      { title: "Tea / Coffee Register — Pratham Pathology" },
      { name: "description", content: "Track daily staff tea and coffee consumption and settle the monthly tea/coffee bill." },
      { property: "og:title", content: "Tea / Coffee Register — Pratham Pathology" },
      { property: "og:description", content: "Daily tea/coffee consumption tracking and monthly bill payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell><TeaCoffeePage /></AppShell>,
});

const rupee = (n: number | string) => `₹ ${Number(n).toFixed(2)}`;

function TeaCoffeePage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold tracking-tight">Tea / Coffee</h1>
      <DailySection />
      <MonthlySection />
    </div>
  );
}

// ---------------- Section A: daily entry ----------------

function DailySection() {
  const [date, setDate] = useState(todayKey());
  const { data: employees } = useEmployees();
  const { data: rates } = useTeaCoffeeRates();
  const { data, isLoading } = useTeaCoffeeDay(date);
  const create = useCreateTeaCoffeeEntry(date);
  const update = useUpdateTeaCoffeeEntry(date);
  const remove = useDeleteTeaCoffeeEntry(date);

  const [employeeId, setEmployeeId] = useState("");
  const [item, setItem] = useState<TeaCoffeeItem>("tea");
  const [quantity, setQuantity] = useState("1");
  const [editing, setEditing] = useState<string | null>(null);

  const activeEmployees = (employees ?? []).filter((e) => e.active);
  const rate = Number(rates?.find((r) => r.item === item)?.rate ?? 0);

  function reset() {
    setEditing(null);
    setEmployeeId("");
    setItem("tea");
    setQuantity("1");
  }

  async function save() {
    if (!employeeId) return toast.error("Select an employee");
    const qty = Math.max(1, Number(quantity) || 1);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing, employeeId, item, quantity: qty, date });
        toast.success("Entry updated");
      } else {
        await create.mutateAsync({ employeeId, item, quantity: qty, date });
        toast.success("Entry saved");
      }
      reset();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save entry");
    }
  }

  const totals = data?.totals;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Daily Entry</h2>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Date</Label>
          <Input type="date" className="w-40" value={date} onChange={(e) => { setDate(e.target.value); reset(); }} />
        </div>
        <div>
          <Label>Employee</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {activeEmployees.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Item</Label>
          <Select value={item} onValueChange={(v) => setItem(v as TeaCoffeeItem)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tea">Tea</SelectItem>
              <SelectItem value="coffee">Coffee</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Quantity</Label>
          <Input type="number" min={1} className="w-24" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <Label>Rate</Label>
          <Input readOnly className="w-24 bg-muted" value={rate.toFixed(2)} />
        </div>
        <Button onClick={save} disabled={create.isPending || update.isPending}>
          {editing ? "Update" : "Save"}
        </Button>
        {editing && <Button variant="ghost" onClick={reset}>Cancel</Button>}
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">Loading…</td></tr>}
            {!isLoading && (data?.entries.length ?? 0) === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">No tea/coffee entries for this date.</td></tr>
            )}
            {data?.entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-2">{e.employee?.name ?? "—"}</td>
                <td className="px-3 py-2 capitalize">{e.item}</td>
                <td className="px-3 py-2 text-right">{e.quantity}</td>
                <td className="px-3 py-2 text-right">{rupee(e.rateAtTime)}</td>
                <td className="px-3 py-2 text-right">{rupee(e.amount)}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => { setEditing(e.id); setEmployeeId(e.employeeId); setItem(e.item); setQuantity(String(e.quantity)); }}
                    aria-label="Edit entry"
                  ><Pencil className="h-4 w-4" /></Button>
                  <Button
                    size="icon" variant="ghost"
                    onClick={async () => {
                      try { await remove.mutateAsync(e.id); toast.success("Entry deleted"); }
                      catch (err: any) { toast.error(err?.message ?? "Could not delete"); }
                    }}
                    aria-label="Delete entry"
                  ><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-6 rounded-md bg-secondary/40 px-4 py-2 text-sm">
        <span>Total Tea: <b>{totals?.teaQty ?? 0}</b></span>
        <span>Total Coffee: <b>{totals?.coffeeQty ?? 0}</b></span>
        <span>Total Amount: <b>{rupee(totals?.totalAmount ?? 0)}</b></span>
        <span className="text-muted-foreground">Daily entries are consumption tracking only — no ledger impact.</span>
      </div>
    </section>
  );
}

// ---------------- Section B: monthly bill ----------------

function currentMonth() { return todayKey().slice(0, 7); }

function MonthlySection() {
  const [month, setMonth] = useState(currentMonth());
  const { data: bill } = useTeaCoffeeMonthlyBill(month);
  const [open, setOpen] = useState(false);

  const paid = bill?.status === "paid";

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Monthly Tea / Coffee Bill</h2>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Bill Month</Label>
          <Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tea" value={`${bill?.teaCount ?? 0} × = ${rupee(bill?.teaAmount ?? 0)}`} />
        <Stat label="Coffee" value={`${bill?.coffeeCount ?? 0} × = ${rupee(bill?.coffeeAmount ?? 0)}`} />
        <Stat label="Total Bill" value={rupee(bill?.totalAmount ?? 0)} />
        <Stat label="Status" value={paid ? "Paid" : "Unpaid"} />
      </div>

      {paid ? (
        <div className="space-y-1 rounded-md border bg-secondary/40 px-4 py-3 text-sm">
          <div>Paid on <b>{bill?.paidDate}</b> — <b>{rupee(bill?.paidAmount ?? 0)}</b> (cash)</div>
          {bill?.expense && (
            <div className="text-muted-foreground">
              Linked expense on {bill.expense.date}: {bill.expense.description}
            </div>
          )}
          {bill?.notes && <div className="text-muted-foreground">Notes: {bill.notes}</div>}
        </div>
      ) : (
        <Button onClick={() => setOpen(true)} disabled={Number(bill?.totalAmount ?? 0) <= 0}>
          Mark as Paid
        </Button>
      )}

      {bill && (
        <MarkPaidDialog
          open={open}
          onOpenChange={setOpen}
          billMonth={bill.billMonth}
          billMonthLabel={bill.billMonthLabel}
          total={Number(bill.totalAmount)}
        />
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

function MarkPaidDialog({
  open, onOpenChange, billMonth, billMonthLabel, total,
}: { open: boolean; onOpenChange: (v: boolean) => void; billMonth: string; billMonthLabel: string; total: number }) {
  const markPaid = useMarkTeaCoffeeBillPaid();
  const [paidDate, setPaidDate] = useState("");
  const [paidAmount, setPaidAmount] = useState(String(total));
  const [notes, setNotes] = useState("");

  useMemo(() => { setPaidAmount(String(total)); }, [total]);

  async function submit() {
    if (!paidDate) return toast.error("Paid date is required");
    const amt = Number(paidAmount);
    if (!(amt > 0)) return toast.error("Paid amount must be greater than 0");
    try {
      await markPaid.mutateAsync({ billMonth, paidDate, paidAmount: amt, notes: notes || undefined });
      toast.success(`${billMonthLabel} bill marked paid — cash expense recorded on ${paidDate}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mark bill as paid");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Mark Tea/Coffee Bill Paid</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Bill Month</Label>
            <Input readOnly className="bg-muted" value={billMonthLabel} />
          </div>
          <div>
            <Label>Paid Date</Label>
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              The cash expense hits the ledger on this date — it may be in a later month than the bill month.
            </p>
          </div>
          <div>
            <Label>Paid Amount</Label>
            <Input type="number" min={0} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </div>
          <div>
            <Label>Mode</Label>
            <Input readOnly className="bg-muted" value="Cash" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={markPaid.isPending}>Mark as Paid</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
