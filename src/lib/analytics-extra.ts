/**
 * Types, grouping helpers and PDF/Excel export for the Expense, Closing Balance,
 * Doctor / Referral-wise and Outsourced Lab-wise analytics reports (read-only).
 */
import { amt, dayLabel } from "./analytics-export";
import { labKey } from "./analytics-report";

export interface ExpenseRow { id: string; date: string; description: string; mode: string; amount: number }
export interface ExpenseReport { fromDate: string; toDate: string; rows: ExpenseRow[] }

export interface ClosingRow {
  date: string; openingCash: number; cashCollection: number; addedCash: number;
  cashExpenses: number; cashTakenAway: number; closingCash: number; closed: boolean;
}
export interface ClosingBalanceReport { fromDate: string; toDate: string; rows: ClosingRow[] }

export interface DoctorRow { doctor: string; patientCount: number; total: number; discount: number; net: number; paid: number; balance: number }
export interface DoctorReport { fromDate: string; toDate: string; rows: DoctorRow[] }

export interface OutsourcedDetail { date: string; registerNumber: number; patientId: string; name: string; testName: string; lab: string; rate: number }
export interface OutsourcedReport { fromDate: string; toDate: string; details: OutsourcedDetail[] }
export interface OutsourcedLabRow { lab: string; patientCount: number; testCount: number; amount: number }

const LAB_NAMES: Record<string, string> = { metropolis: "Metropolis", lupin: "Lupin", qualilife: "Qualilife" };
/** Normalised display name for an outsourced lab. */
export function labName(lab: string) {
  const k = labKey(lab);
  return k === "tests" ? lab.trim() : LAB_NAMES[k];
}

export function groupOutsourced(details: OutsourcedDetail[]): OutsourcedLabRow[] {
  const m = new Map<string, { lab: string; patients: Set<string>; testCount: number; amount: number }>();
  for (const d of details) {
    const lab = labName(d.lab);
    const g = m.get(lab) ?? { lab, patients: new Set<string>(), testCount: 0, amount: 0 };
    g.patients.add(d.patientId); g.testCount += 1; g.amount += d.rate;
    m.set(lab, g);
  }
  return [...m.values()]
    .map(g => ({ lab: g.lab, patientCount: g.patients.size, testCount: g.testCount, amount: Math.round(g.amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

// ---------------- Generic table spec used by UI + exports ----------------

export interface Col<T> {
  label: string;
  /** Numeric columns are summed in the totals row. */
  num?: keyof T & string;
  text?: (r: T) => string | number;
  /** Count format (no currency decimals). */
  count?: boolean;
}

export function totalsOf<T>(cols: Col<T>[], rows: T[]) {
  return cols.map(c => c.num ? Math.round(rows.reduce((s, r) => s + Number((r as any)[c.num!] || 0), 0) * 100) / 100 : null);
}

export const cellText = <T,>(c: Col<T>, r: T) => c.num ? (c.count ? String((r as any)[c.num]) : amt((r as any)[c.num])) : String(c.text!(r));

const LAB = "Pratham Pathology Laboratory";
const rangeLabel = (from: string, to: string) => `${dayLabel(from)} to ${dayLabel(to)}`;

export interface TableSection<T> { title?: string; cols: Col<T>[]; rows: T[] }

export async function downloadReportPdf(title: string, from: string, to: string, sections: TableSection<any>[], file: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text(LAB, 8, 10);
  doc.setFontSize(10); doc.text(`${title} — ${rangeLabel(from, to)}`, 8, 16); doc.setFont("helvetica", "normal");
  let y = 19;
  for (const s of sections) {
    if (s.title) { doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text(s.title, 8, y + 3); doc.setFont("helvetica", "normal"); y += 4.5; }
    const totals = totalsOf(s.cols, s.rows);
    const colStyles: Record<number, any> = {};
    s.cols.forEach((c, i) => { if (c.num) colStyles[i] = { halign: "right" }; });
    autoTable(doc, {
      theme: "grid", startY: y,
      styles: { fontSize: 7.5, cellPadding: 1, lineWidth: 0.1 },
      headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
      footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: "bold" },
      margin: { left: 8, right: 8 },
      head: [s.cols.map(c => c.label)],
      body: s.rows.length ? s.rows.map(r => s.cols.map(c => cellText(c, r))) : [[{ content: "No records found for selected period.", colSpan: s.cols.length }]],
      foot: [s.cols.map((c, i) => i === 0 ? "TOTAL" : totals[i] === null ? "" : c.count ? String(totals[i]) : amt(totals[i]!))],
      columnStyles: colStyles,
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }
  doc.save(file);
}

export async function downloadReportExcel(title: string, from: string, to: string, sections: TableSection<any>[], file: string) {
  const XLSX = await import("xlsx");
  const aoa: any[][] = [[LAB], [`${title} — ${rangeLabel(from, to)}`]];
  for (const s of sections) {
    aoa.push([]);
    if (s.title) aoa.push([s.title]);
    aoa.push(s.cols.map(c => c.label));
    if (!s.rows.length) aoa.push(["No records found for selected period."]);
    for (const r of s.rows) aoa.push(s.cols.map(c => c.num ? Number((r as any)[c.num] || 0) : c.text!(r)));
    const totals = totalsOf(s.cols, s.rows);
    aoa.push(s.cols.map((_, i) => i === 0 ? "TOTAL" : totals[i] ?? ""));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), title.slice(0, 31));
  XLSX.writeFile(wb, file);
}
