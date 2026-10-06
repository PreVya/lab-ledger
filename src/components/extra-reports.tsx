import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { todayKey, useClosingBalanceReport, useDoctorReport, useExpenseReport, useOutsourcedReport } from "@/lib/queries";
import { dayLabel, monthLabel } from "@/lib/analytics-export";
import {
  type Col, type TableSection, type ExpenseRow, type ClosingRow, type DoctorRow, type OutsourcedDetail, type OutsourcedLabRow,
  cellText, totalsOf, downloadReportExcel, downloadReportPdf, groupOutsourced, labName,
} from "@/lib/analytics-extra";
import { amt } from "@/lib/analytics-export";

const FIRST_MONTH = "2026-08";
const th = "px-2 py-1.5 font-medium";
const td = "px-2 py-1.5";
const num = "px-2 py-1.5 text-right tabular-nums";
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";

function monthOptions(today: string) {
  const out: string[] = [];
  let m = FIRST_MONTH;
  while (m <= today.slice(0, 7)) {
    out.push(m);
    const [y, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  }
  return out.reverse();
}

function monthRange(m: string, today: string) {
  const [y, mm] = m.split("-").map(Number);
  const end = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
  return { from: `${m}-01`, to: end < today ? end : today };
}

/** Month selector (quick) + custom from/to date range. */
function useRange() {
  const today = todayKey();
  const months = useMemo(() => monthOptions(today), [today]);
  const [month, setMonth] = useState(months[0] ?? FIRST_MONTH);
  const init = monthRange(month, today);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [range, setRange] = useState(init);
  const ui = (
    <>
      <div className="space-y-1">
        <Label className="text-xs">Month</Label>
        <select className={`${selectCls} w-40`} value={month} onChange={e => {
          const m = e.target.value; setMonth(m);
          if (!m) return;
          const r = monthRange(m, today); setFrom(r.from); setTo(r.to); setRange(r);
        }}>
          <option value="">Custom range</option>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">From date</Label>
        <Input type="date" className="h-9 w-40" value={from} onChange={e => { setFrom(e.target.value); setMonth(""); }} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">To date</Label>
        <Input type="date" className="h-9 w-40" value={to} onChange={e => { setTo(e.target.value); setMonth(""); }} />
      </div>
      {!month && (
        <Button size="sm" disabled={!from || !to || to < from} onClick={() => setRange({ from, to })}>Apply</Button>
      )}
    </>
  );
  return { range, ui };
}

function run(fn: () => Promise<void>) {
  fn().catch(e => toast.error(`Download failed: ${(e as Error).message}`));
}

function Downloads({ title, from, to, sections, file }: { title: string; from: string; to: string; sections: TableSection<any>[]; file: string }) {
  return (
    <div className="ml-auto flex gap-2">
      <Button size="sm" variant="outline" onClick={() => run(() => downloadReportPdf(title, from, to, sections, `${file}.pdf`))}><Download className="mr-1 h-4 w-4" />Download PDF</Button>
      <Button size="sm" variant="outline" onClick={() => run(() => downloadReportExcel(title, from, to, sections, `${file}.xlsx`))}><FileSpreadsheet className="mr-1 h-4 w-4" />Download Excel</Button>
    </div>
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

function ReportTable<T>({ cols, rows, rowKey }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T, i: number) => string }) {
  const totals = totalsOf(cols, rows);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-secondary/60 text-left">
          <tr>{cols.map(c => <th key={c.label} className={c.num ? `${th} text-right` : th}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} className="py-6 text-center text-muted-foreground">No records found for selected period.</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-t">
              {cols.map(c => <td key={c.label} className={c.num ? num : td}>{cellText(c, r)}</td>)}
            </tr>
          ))}
          <tr className="border-t bg-secondary/40 font-semibold">
            {cols.map((c, i) => (
              <td key={c.label} className={c.num ? num : td}>
                {i === 0 ? "TOTAL" : totals[i] === null ? "" : c.count ? totals[i] : amt(totals[i]!)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const rangeText = (from: string, to: string) => `${dayLabel(from)} to ${dayLabel(to)}`;

// ---------------- 1. Expense Report ----------------
const EXPENSE_COLS: Col<ExpenseRow>[] = [
  { label: "Date", text: r => dayLabel(r.date) },
  { label: "Description", text: r => r.description },
  { label: "Mode", text: r => r.mode.toUpperCase() },
  { label: "Amount", num: "amount" },
];

export function ExpenseReportTab() {
  const { range, ui } = useRange();
  const [mode, setMode] = useState("all");
  const q = useExpenseReport(range.from, range.to);
  const rows = (q.data?.rows ?? []).filter(r => mode === "all" || r.mode === mode);
  const title = "Expense Report";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {ui}
        <div className="space-y-1">
          <Label className="text-xs">Mode</Label>
          <select className={`${selectCls} w-28`} value={mode} onChange={e => setMode(e.target.value)}>
            <option value="all">All</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
          </select>
        </div>
        {q.data && <Downloads title={mode === "all" ? title : `${title} (${mode.toUpperCase()})`} from={range.from} to={range.to} sections={[{ cols: EXPENSE_COLS, rows }]} file={`expense-report-${range.from}-to-${range.to}`} />}
      </div>
      <State q={q} />
      {q.data && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold">{title} — {rangeText(range.from, range.to)}</h3>
          <ReportTable cols={EXPENSE_COLS} rows={rows} rowKey={r => r.id} />
        </div>
      )}
    </div>
  );
}

// ---------------- 2. Closing Balance Report ----------------
const CLOSING_COLS: Col<ClosingRow>[] = [
  { label: "Date", text: r => dayLabel(r.date) },
  { label: "Opening Cash", num: "openingCash" },
  { label: "Cash Collection", num: "cashCollection" },
  { label: "Added Cash", num: "addedCash" },
  { label: "Cash Expenses", num: "cashExpenses" },
  { label: "Cash Taken Away", num: "cashTakenAway" },
  { label: "Closing Cash", num: "closingCash" },
  { label: "Status", text: r => (r.closed ? "Closed" : "Not Closed") },
];

export function ClosingBalanceReportTab() {
  const { range, ui } = useRange();
  const q = useClosingBalanceReport(range.from, range.to);
  const rows = q.data?.rows ?? [];
  const title = "Closing Balance Report";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {ui}
        {q.data && <Downloads title={title} from={range.from} to={range.to} sections={[{ cols: CLOSING_COLS, rows }]} file={`closing-balance-${range.from}-to-${range.to}`} />}
      </div>
      <State q={q} />
      {q.data && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold">{title} — {rangeText(range.from, range.to)}</h3>
          <ReportTable cols={CLOSING_COLS} rows={rows} rowKey={r => r.date} />
          <p className="text-xs text-muted-foreground">Cash only. Closing Cash = Opening + Cash Collection + Added Cash − Cash Expenses − Cash Taken Away, same as the daily ledger. Sundays are skipped. This report only reads data.</p>
        </div>
      )}
    </div>
  );
}

// ---------------- 3. Doctor / Referral-wise Report ----------------
const DOCTOR_COLS: Col<DoctorRow>[] = [
  { label: "Doctor / Referred By", text: r => r.doctor },
  { label: "Patient Count", num: "patientCount", count: true },
  { label: "Total Amount", num: "total" },
  { label: "Discount", num: "discount" },
  { label: "Net Amount", num: "net" },
  { label: "Paid Amount", num: "paid" },
  { label: "Balance Amount", num: "balance" },
];

export function DoctorReportTab() {
  const { range, ui } = useRange();
  const [search, setSearch] = useState("");
  const q = useDoctorReport(range.from, range.to);
  const rows = (q.data?.rows ?? []).filter(r => r.doctor.toLowerCase().includes(search.trim().toLowerCase()));
  const title = "Doctor / Referral-wise Report";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {ui}
        <div className="space-y-1">
          <Label className="text-xs">Doctor</Label>
          <Input className="h-9 w-48" placeholder="All doctors" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {q.data && <Downloads title={title} from={range.from} to={range.to} sections={[{ cols: DOCTOR_COLS, rows }]} file={`doctor-referral-${range.from}-to-${range.to}`} />}
      </div>
      <State q={q} />
      {q.data && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold">{title} — {rangeText(range.from, range.to)}</h3>
          <ReportTable cols={DOCTOR_COLS} rows={rows} rowKey={r => r.doctor} />
          <p className="text-xs text-muted-foreground">Patients by entry date. Paid = all recorded payments of those patients. Balance = Net − Paid (never below 0).</p>
        </div>
      )}
    </div>
  );
}

// ---------------- 4. Outsourced Lab-wise Report ----------------
const LAB_COLS: Col<OutsourcedLabRow>[] = [
  { label: "Outsourced Lab", text: r => r.lab },
  { label: "Patient Count", num: "patientCount", count: true },
  { label: "Test Count", num: "testCount", count: true },
  { label: "Total Outsourced Amount", num: "amount" },
];
const DETAIL_COLS: Col<OutsourcedDetail>[] = [
  { label: "Date", text: r => dayLabel(r.date) },
  { label: "Reg #", text: r => r.registerNumber },
  { label: "Patient Name", text: r => r.name },
  { label: "Test Name", text: r => r.testName },
  { label: "Outsourced Lab", text: r => labName(r.lab) },
  { label: "Rate", num: "rate" },
];

export function OutsourcedReportTab() {
  const { range, ui } = useRange();
  const [lab, setLab] = useState("all");
  const q = useOutsourcedReport(range.from, range.to);
  const all = q.data?.details ?? [];
  const labs = useMemo(() => [...new Set(all.map(d => labName(d.lab)))].sort(), [all]);
  const details = all.filter(d => lab === "all" || labName(d.lab) === lab);
  const grouped = groupOutsourced(details);
  const title = "Outsourced Lab-wise Report";
  const sections: TableSection<any>[] = [
    { title: "Lab-wise Summary", cols: LAB_COLS, rows: grouped },
    { title: "Test Details", cols: DETAIL_COLS, rows: details },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {ui}
        <div className="space-y-1">
          <Label className="text-xs">Lab</Label>
          <select className={`${selectCls} w-36`} value={lab} onChange={e => setLab(e.target.value)}>
            <option value="all">All labs</option>
            {[...new Set(["Metropolis", "Lupin", "Qualilife", ...labs])].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {q.data && <Downloads title={lab === "all" ? title : `${title} (${lab})`} from={range.from} to={range.to} sections={sections} file={`outsourced-labs-${range.from}-to-${range.to}`} />}
      </div>
      <State q={q} />
      {q.data && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold">{title} — {rangeText(range.from, range.to)}</h3>
          <ReportTable cols={LAB_COLS} rows={grouped} rowKey={r => r.lab} />
          <div>
            <h4 className="mb-2 text-sm font-semibold">Test Details</h4>
            <ReportTable cols={DETAIL_COLS} rows={details} rowKey={(r, i) => `${r.patientId}-${i}`} />
          </div>
          <p className="text-xs text-muted-foreground">Only outsourced tests are included (in-house tests excluded), by patient entry date. Patient Count is distinct patients per lab.</p>
        </div>
      )}
    </div>
  );
}
