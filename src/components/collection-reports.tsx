import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { todayKey, useDailyCollectionReport, useMonthlyCollectionReport } from "@/lib/queries";
import type { DailyReport, MonthlyReport, SettlementRow } from "@/lib/analytics-report";
import {
  amt, dayLabel, monthLabel, paidText,
  downloadDailyExcel, downloadDailyPdf, downloadMonthlyExcel, downloadMonthlyPdf,
} from "@/lib/analytics-export";
import { toast } from "sonner";

const FIRST_MONTH = "2026-08";
const th = "px-2 py-1.5 font-medium";
const td = "px-2 py-1.5";
const num = "px-2 py-1.5 text-right tabular-nums";

function monthOptions(today: string) {
  const out: string[] = [];
  let m = FIRST_MONTH;
  const last = today.slice(0, 7);
  while (m <= last) {
    out.push(m);
    const [y, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  }
  return out.reverse();
}

function run(fn: () => Promise<void>) {
  fn().catch(e => toast.error(`Download failed: ${(e as Error).message}`));
}

export function CollectionReports() {
  const today = todayKey();
  const [date, setDate] = useState(today);
  const months = useMemo(() => monthOptions(today), [today]);
  const [month, setMonth] = useState(months[0] ?? FIRST_MONTH);
  const daily = useDailyCollectionReport(date);
  const monthly = useMonthlyCollectionReport(month);

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Collection Reports</h2>
      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Daily Collection Report</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Collection Report</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" className="h-9 w-44" min="2026-08-01" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
            </div>
            {daily.data && (
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => run(() => downloadDailyPdf(daily.data!))}><Download className="mr-1 h-4 w-4" />Download PDF</Button>
                <Button size="sm" variant="outline" onClick={() => run(() => downloadDailyExcel(daily.data!))}><FileSpreadsheet className="mr-1 h-4 w-4" />Download Excel</Button>
              </div>
            )}
          </div>
          <State q={daily} />
          {daily.data && <DailyView r={daily.data} />}
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Month</Label>
              <select className="h-9 w-44 rounded-md border bg-background px-2 text-sm" value={month} onChange={e => setMonth(e.target.value)}>
                {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
            {monthly.data && (
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => run(() => downloadMonthlyPdf(monthly.data!))}><Download className="mr-1 h-4 w-4" />Download PDF</Button>
                <Button size="sm" variant="outline" onClick={() => run(() => downloadMonthlyExcel(monthly.data!))}><FileSpreadsheet className="mr-1 h-4 w-4" />Download Excel</Button>
              </div>
            )}
          </div>
          <State q={monthly} />
          {monthly.data && <MonthlyView r={monthly.data} />}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function State({ q }: { q: { isLoading: boolean; error: unknown } }) {
  if (q.isLoading) return <div className="h-24 animate-pulse rounded-md border bg-muted/40" />;
  if (q.error) return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      Could not load report. {(q.error as Error).message}
    </div>
  );
  return null;
}

function DailyView({ r }: { r: DailyReport }) {
  const t = r.patientTotals;
  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold">Daily Collection Report — {dayLabel(r.date)}</h3>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Today's Patient Entries</h4>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-secondary/60 text-left">
              <tr>
                <th className={th}>Reg #</th><th className={th}>Patient Name</th><th className={th}>Age/Sex</th>
                <th className={th}>Test Names</th><th className={`${th} text-right`}>Metropolis</th><th className={`${th} text-right`}>Lupin</th>
                <th className={`${th} text-right`}>Qualilife</th><th className={`${th} text-right`}>Tests</th><th className={`${th} text-right`}>Total</th>
                <th className={`${th} text-right`}>Discount</th><th className={`${th} text-right`}>Paid</th><th className={`${th} text-right`}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {r.patients.length === 0 && (
                <tr><td colSpan={12} className="py-6 text-center text-muted-foreground">No patient entries on this date.</td></tr>
              )}
              {r.patients.map(p => (
                <tr key={p.id} className="border-t align-top">
                  <td className={td}>{p.registerNumber}</td>
                  <td className={td}>{p.name}</td>
                  <td className={`${td} whitespace-nowrap`}>{p.ageSex}</td>
                  <td className={`${td} max-w-[280px]`}>{p.testNames.join(", ")}</td>
                  <td className={num}>{amt(p.metropolis)}</td>
                  <td className={num}>{amt(p.lupin)}</td>
                  <td className={num}>{amt(p.qualilife)}</td>
                  <td className={num}>{amt(p.tests)}</td>
                  <td className={num}>{amt(p.total)}</td>
                  <td className={num}>{amt(p.discount)}</td>
                  <td className={`${num} whitespace-nowrap`}>{paidText(p.paidParts)}</td>
                  <td className={`${num} font-semibold`}>{amt(p.balance)}</td>
                </tr>
              ))}
              {r.patients.length > 0 && (
                <tr className="border-t bg-secondary/40 font-semibold">
                  <td className={td} colSpan={4}>TOTAL</td>
                  <td className={num}>{amt(t.metropolis)}</td><td className={num}>{amt(t.lupin)}</td>
                  <td className={num}>{amt(t.qualilife)}</td><td className={num}>{amt(t.tests)}</td>
                  <td className={num}>{amt(t.total)}</td><td className={num}>{amt(t.discount)}</td>
                  <td className={num}>{amt(t.paid)}</td><td className={num}>{amt(t.balance)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Future Balance Settlements for Patients of This Date</h4>
        {r.futureSettlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No future balance settlements found.</p>
        ) : (
          <SmallTable head={["Date", "Reg #", "Patient Name", "Amount", "Mode"]}
            rows={r.futureSettlements.map(x => [dayLabel(x.date), x.registerNumber, x.name, `₹ ${amt(x.amount)}`, x.mode.toUpperCase()])} />
        )}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Previous Balance Received</h4>
        {r.previousBalances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No previous balances received on this date.</p>
        ) : (
          <SmallTable head={["Patient", "Reg No.", "FY", "Patient Entry Date", "Mode", "Amount"]}
            rows={r.previousBalances.map((x: SettlementRow) => [x.name, x.registerNumber, x.financialYear, dayLabel(x.entryDate), x.mode.toUpperCase(), `₹ ${amt(x.amount)}`])} />
        )}
      </div>

      <div className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm font-semibold tabular-nums">
        <div>CASH: ₹ {amt(r.todayCollection.cash)} + ₹ {amt(r.previousCollection.cash)} = ₹ {amt(r.totalCollection.cash)}</div>
        <div>UPI: ₹ {amt(r.todayCollection.upi)} + ₹ {amt(r.previousCollection.upi)} = ₹ {amt(r.totalCollection.upi)}</div>
        {r.totalCollection.card > 0 && (
          <div>CARD: ₹ {amt(r.todayCollection.card)} + ₹ {amt(r.previousCollection.card)} = ₹ {amt(r.totalCollection.card)}</div>
        )}
        <p className="pt-1 text-xs font-normal text-muted-foreground">Today's patients + previous balances. Opening/closing cash, handover, added cash and expenses are not included.</p>
      </div>
    </div>
  );
}

function SmallTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-secondary/60 text-left"><tr>{head.map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className={td}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function MonthlyView({ r }: { r: MonthlyReport }) {
  const t = r.totals;
  const cols = ["metropolis", "lupin", "qualilife", "tests", "total", "discount", "paid"] as const;
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Monthly Collection Report — {monthLabel(r.month)}</h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-secondary/60 text-left">
            <tr>
              <th className={th}>Date</th>
              {["Metropolis", "Lupin", "Qualilife", "Tests", "Total", "Discount", "Paid"].map(h => <th key={h} className={`${th} text-right`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No entries for this month yet.</td></tr>}
            {r.rows.map(x => (
              <tr key={x.date} className="border-t">
                <td className={td}>{dayLabel(x.date)}</td>
                {cols.map(c => <td key={c} className={num}>{amt(x[c])}</td>)}
              </tr>
            ))}
            <tr className="border-t bg-secondary/40 font-semibold">
              <td className={td}>TOTAL</td>
              {cols.map(c => <td key={c} className={num}>{amt(t[c])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Paid = money received on that date from patients entered that same date. Previous balances are not included.</p>
    </div>
  );
}
