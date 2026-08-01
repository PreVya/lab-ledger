import { jsPDF } from "jspdf";
import { LAB_PROFILE } from "./lab-profile";
import type { Bill } from "./types";

/** A5 portrait bill: 148mm x 210mm. */
const W = 148;
const H = 210;
const M = 10; // margin mm

function money(v: string | number) {
  return `Rs. ${Number(v).toFixed(2)}`;
}

async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = LAB_PROFILE.logoUrl;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

export async function downloadBillPdf(bill: Bill) {
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const center = W / 2;
  const right = W - M;
  let y = M + 4;

  const rule = (weight = 0.2, gap = 3) => {
    doc.setLineWidth(weight);
    doc.line(M, y, right, y);
    y += gap;
  };

  const pageBreak = (need: number) => {
    if (y + need > H - M) {
      doc.addPage();
      y = M;
    }
  };

  // ---- Header ---------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  const nameLines = doc.splitTextToSize(LAB_PROFILE.name.toUpperCase(), W - 2 * M);
  doc.text(nameLines, center, y, { align: "center" });
  y += 6.5 * nameLines.length;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const addr = doc.splitTextToSize(LAB_PROFILE.address, W - 2 * M);
  doc.text(addr, center, y, { align: "center" });
  y += 4 * addr.length + 2;

  // ---- Doctor / logo / timings ----------------------------------------
  const logo = await loadLogo();
  const logoSize = 26;
  const top = y;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", center - logoSize / 2, top, logoSize, logoSize);
    } catch { /* ignore logo failures */ }
  }
  const mid = top + logoSize / 2;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(doc.splitTextToSize(LAB_PROFILE.doctorName, 40), M, mid - 1);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(LAB_PROFILE.doctorDesignation, 40), M, mid + 3.5);

  const timingLabel = "Lab Timings: ";
  const valueW = doc.getTextWidth(LAB_PROFILE.timingsValue);
  doc.setFont("helvetica", "bold");
  const labelW = doc.getTextWidth(timingLabel);
  doc.text(timingLabel, right - valueW - labelW, mid - 1);
  doc.setFont("helvetica", "normal");
  doc.text(LAB_PROFILE.timingsValue, right, mid - 1, { align: "right" });
  doc.text(LAB_PROFILE.timingsLine2, right, mid + 3.5, { align: "right" });

  y = top + logoSize + 3;
  rule(0.5, 5);

  // ---- Bill & patient details -----------------------------------------
  doc.setFontSize(9);
  const colX = [M, center + 2];
  const pairs: Array<[string, string]> = [
    ["Bill No.", String(bill.billNumber)],
    ["Bill Date", bill.billDate.slice(0, 10)],
    ["Patient Reg No.", String(bill.patientRegisterNumberSnapshot)],
    ["Patient FY", bill.patientFinancialYearSnapshot],
    ["Patient", bill.patientNameSnapshot],
    ["Age / Sex", `${bill.patientAgeSnapshot} / ${bill.patientSexSnapshot}`],
  ];
  if (bill.patientMobileSnapshot) pairs.push(["Mobile", bill.patientMobileSnapshot]);
  if (bill.referredDoctorSnapshot) pairs.push(["Referred By", bill.referredDoctorSnapshot]);

  pairs.forEach(([label, value], i) => {
    const x = colX[i % 2];
    const rowY = y + Math.floor(i / 2) * 5.5;
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, x, rowY);
    const lw = doc.getTextWidth(`${label}: `);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(value, 62 - lw), x + lw, rowY);
  });
  y += Math.ceil(pairs.length / 2) * 5.5 + 3;

  // ---- Test table -------------------------------------------------------
  const cx = {
    sr: M,
    test: M + 8,
    rate: M + 79,
    amount: M + 101,
    lab: M + 105,
  };
  rule(0.4, 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("#", cx.sr, y);
  doc.text("Test", cx.test, y);
  doc.text("Rate", cx.rate, y, { align: "right" });
  doc.text("Amount", cx.amount, y, { align: "right" });
  doc.text("Outsourced to", cx.lab, y);
  y += 2;
  rule(0.4, 4.5);

  doc.setFont("helvetica", "normal");
  bill.items.forEach((it, i) => {
    const nameLines2 = doc.splitTextToSize(it.testName, 66);
    const labLines = doc.splitTextToSize(it.outsourcedLab || "-", 22);
    const rowH = 4.2 * Math.max(nameLines2.length, labLines.length) + 1.5;
    pageBreak(rowH);
    doc.text(String(i + 1), cx.sr, y);
    doc.text(nameLines2, cx.test, y);
    doc.text(Number(it.rate).toFixed(2), cx.rate, y, { align: "right" });
    doc.text(Number(it.amount).toFixed(2), cx.amount, y, { align: "right" });
    doc.text(labLines, cx.lab, y);
    y += rowH;
    doc.setDrawColor(180);
    doc.setLineWidth(0.1);
    doc.line(M, y - 2.6, right, y - 2.6);
    doc.setDrawColor(0);
  });

  y += 3;

  // ---- Amounts ----------------------------------------------------------
  pageBreak(45);
  const boxX = center + 4;
  const amt = (label: string, value: string | number, bold = false) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${label}:`, boxX, y);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(money(value), right, y, { align: "right" });
    y += 5.2;
  };
  amt("Total Amount", bill.totalAmount);
  amt("Discount", bill.discount);
  amt("Net Amount", bill.netAmount, true);
  amt("Paid Amount", bill.paidAmount);
  amt("Balance Amount", bill.balanceAmount);

  y += 1;
  rule(0.3, 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const wordsLabel = "Amount in Words: ";
  doc.text(wordsLabel, M, y);
  const wlw = doc.getTextWidth(wordsLabel);
  doc.setFont("helvetica", "normal");
  const words = doc.splitTextToSize(bill.amountInWords, W - 2 * M - wlw);
  doc.text(words, M + wlw, y);
  y += 4.2 * words.length;
  rule(0.3, 6);

  // ---- Signature ---------------------------------------------------------
  pageBreak(35);
  y += 22;
  doc.setLineWidth(0.2);
  doc.line(right - 45, y, right, y);
  y += 4.5;
  doc.setFontSize(8.5);
  doc.text("Authorized Signature", right - 22.5, y, { align: "center" });

  if (LAB_PROFILE.footerNote) {
    y += 10;
    pageBreak(8);
    doc.setFontSize(8);
    doc.text(LAB_PROFILE.footerNote, center, y, { align: "center" });
  }

  doc.save(`Bill-${bill.billNumber}-${bill.patientNameSnapshot.replace(/\s+/g, "_")}.pdf`);
}
