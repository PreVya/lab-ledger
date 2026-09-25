import type { DailyReport, MonthlyReport, ModeAmount } from "./analytics-report";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const dayLabel = (k: string) => { const [y, m, d] = k.split("-"); return `${d}-${MONTHS[Number(m) - 1]}-${y}`; };
export const monthLabel = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
export const amt = (n: number) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const paidText = (parts: ModeAmount[]) => parts.length ? parts.map(p => `${amt(p.amount)} ${p.mode.toUpperCase()}`).join(" + ") : "-";
const LAB = "Pratham Pathology Laboratory";

async function pdfKit() {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  return { doc, autoTable };
}

const tableStyle = {
  theme: "grid" as const,
  styles: { fontSize: 7, cellPadding: 1, overflow: "linebreak" as const, lineWidth: 0.1 },
  headStyles: { fillColor: [235, 235, 235] as [number, number, number], textColor: 20, fontStyle: "bold" as const },
  footStyles: { fillColor: [245, 245, 245] as [number, number, number], textColor: 20, fontStyle: "bold" as const },
  margin: { left: 8, right: 8 },
};

function header(doc: any, title: string) {
  doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text(LAB, 8, 10);
  doc.setFontSize(10);
  doc.text(title, 8, 16);
  doc.setFont("helvetica", "normal");
}

export function dailyTableRows(r: DailyReport) {
  return r.patients.map(p => [
    p.registerNumber, p.name, p.ageSex, p.testNames.join(", "),
    amt(p.metropolis), amt(p.lupin), amt(p.qualilife), amt(p.tests),
    amt(p.total), amt(p.discount), paidText(p.paidParts), amt(p.balance),
  ]);
}
const DAILY_HEAD = ["Reg #", "Patient Name", "Age/Sex", "Test Names", "Metropolis", "Lupin", "Qualilife", "Tests", "Total", "Discount", "Paid", "Balance"];
const summaryLines = (r: DailyReport) => {
  const L = [
    `CASH: Rs. ${amt(r.todayCollection.cash)} + Rs. ${amt(r.previousCollection.cash)} = Rs. ${amt(r.totalCollection.cash)}`,
    `UPI: Rs. ${amt(r.todayCollection.upi)} + Rs. ${amt(r.previousCollection.upi)} = Rs. ${amt(r.totalCollection.upi)}`,
  ];
  if (r.totalCollection.card > 0) L.push(`CARD: Rs. ${amt(r.todayCollection.card)} + Rs. ${amt(r.previousCollection.card)} = Rs. ${amt(r.totalCollection.card)}`);
  return L;
};

export async function downloadDailyPdf(r: DailyReport) {
  const { doc, autoTable } = await pdfKit();
  header(doc, `Daily Collection Report — ${dayLabel(r.date)}`);
  const t = r.patientTotals;
  autoTable(doc, {
    ...tableStyle, startY: 19,
    head: [DAILY_HEAD], body: dailyTableRows(r),
    foot: [["", "TOTAL", "", "", amt(t.metropolis), amt(t.lupin), amt(t.qualilife), amt(t.tests), amt(t.total), amt(t.discount), amt(t.paid), amt(t.balance)]],
    columnStyles: { 3: { cellWidth: 70 } },
  });
  const sec = (title: string, rows: DailyReport["futureSettlements"], future: boolean, empty: string) => {
    let y = (doc as any).lastAutoTable.finalY + 5;
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text(title, 8, y); doc.setFont("helvetica", "normal");
    if (!rows.length) { doc.setFontSize(8); doc.text(empty, 8, y + 4); (doc as any).lastAutoTable.finalY = y + 4; return; }
    autoTable(doc, {
      ...tableStyle, startY: y + 1.5,
      head: [future ? ["Date", "Reg #", "Patient Name", "Amount", "Mode"] : ["Patient", "Reg #", "FY", "Patient Entry Date", "Mode", "Amount"]],
      body: rows.map(x => future
        ? [dayLabel(x.date), x.registerNumber, x.name, amt(x.amount), x.mode.toUpperCase()]
        : [x.name, x.registerNumber, x.financialYear, dayLabel(x.entryDate), x.mode.toUpperCase(), amt(x.amount)]),
    });
  };
  sec("Future Balance Settlements for Patients of This Date", r.futureSettlements, true, "No future balance settlements found.");
  sec("Previous Balance Received", r.previousBalances, false, "No previous balances received on this date.");
  let y = (doc as any).lastAutoTable.finalY + 6;
  doc.setFontSize(10); doc.setFont("helvetica", "bold");
  for (const l of summaryLines(r)) { doc.text(l, 8, y); y += 5; }
  doc.save(`daily-collection-${r.date}.pdf`);
}

export async function downloadMonthlyPdf(r: MonthlyReport) {
  const { doc, autoTable } = await pdfKit();
  header(doc, `Monthly Collection Report — ${monthLabel(r.month)}`);
  const t = r.totals;
  autoTable(doc, {
    ...tableStyle, startY: 19,
    styles: { ...tableStyle.styles, fontSize: 7.5, halign: "right" },
    head: [["Date", "Metropolis", "Lupin", "Qualilife", "Tests", "Total", "Discount", "Paid"]],
    body: r.rows.map(x => [dayLabel(x.date), amt(x.metropolis), amt(x.lupin), amt(x.qualilife), amt(x.tests), amt(x.total), amt(x.discount), amt(x.paid)]),
    foot: [["TOTAL", amt(t.metropolis), amt(t.lupin), amt(t.qualilife), amt(t.tests), amt(t.total), amt(t.discount), amt(t.paid)]],
    columnStyles: { 0: { halign: "left" } },
  });
  doc.save(`monthly-collection-${r.month}.pdf`);
}

async function saveXlsx(sheets: Array<[string, any[][]]>, file: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  XLSX.writeFile(wb, file);
}

export async function downloadDailyExcel(r: DailyReport) {
  const t = r.patientTotals;
  const aoa: any[][] = [
    [LAB], [`Daily Collection Report — ${dayLabel(r.date)}`], [],
    ["Today's Patient Entries"], DAILY_HEAD,
    ...r.patients.map(p => [p.registerNumber, p.name, p.ageSex, p.testNames.join(", "), p.metropolis, p.lupin, p.qualilife, p.tests, p.total, p.discount, paidText(p.paidParts), p.balance]),
    ["", "TOTAL", "", "", t.metropolis, t.lupin, t.qualilife, t.tests, t.total, t.discount, t.paid, t.balance],
    [], ["Future Balance Settlements for Patients of This Date"], ["Date", "Reg #", "Patient Name", "Amount", "Mode"],
    ...(r.futureSettlements.length ? r.futureSettlements.map(x => [dayLabel(x.date), x.registerNumber, x.name, x.amount, x.mode.toUpperCase()]) : [["No future balance settlements found."]]),
    [], ["Previous Balance Received"], ["Patient", "Reg #", "FY", "Patient Entry Date", "Mode", "Amount"],
    ...(r.previousBalances.length ? r.previousBalances.map(x => [x.name, x.registerNumber, x.financialYear, dayLabel(x.entryDate), x.mode.toUpperCase(), x.amount]) : [["No previous balances received on this date."]]),
    [], ...summaryLines(r).map(l => [l]),
  ];
  await saveXlsx([["Daily", aoa]], `daily-collection-${r.date}.xlsx`);
}

export async function downloadMonthlyExcel(r: MonthlyReport) {
  const t = r.totals;
  await saveXlsx([["Monthly", [
    [LAB], [`Monthly Collection Report — ${monthLabel(r.month)}`], [],
    ["Date", "Metropolis", "Lupin", "Qualilife", "Tests", "Total", "Discount", "Paid"],
    ...r.rows.map(x => [dayLabel(x.date), x.metropolis, x.lupin, x.qualilife, x.tests, x.total, x.discount, x.paid]),
    ["TOTAL", t.metropolis, t.lupin, t.qualilife, t.tests, t.total, t.discount, t.paid],
  ]]], `monthly-collection-${r.month}.xlsx`);
}
