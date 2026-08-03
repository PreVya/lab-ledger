import { jsPDF } from "jspdf";
import { LAB_PROFILE } from "./lab-profile";
import type { Bill } from "./types";

/** A5 portrait bill: 148mm x 210mm. */
const W = 148;
const H = 210;
const M = 8;
const CONTENT_W = W - 2 * M;
const PAGE_BOTTOM = H - M;

const TABLE_WIDTHS = {
  number: CONTENT_W * 0.06,
  test: CONTENT_W * 0.48,
  rate: CONTENT_W * 0.14,
  amount: CONTENT_W * 0.14,
  lab: CONTENT_W * 0.18,
};

const CELL_PAD_X = 1.2;
const CELL_PAD_Y = 1.1;
const ROW_LINE_H = 3.7;

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
  let y = M + 3;

  const rule = (weight = 0.2, gap = 3) => {
    doc.setLineWidth(weight);
    doc.line(M, y, right, y);
    y += gap;
  };

  // ---- Header ---------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  const nameLines = doc.splitTextToSize(LAB_PROFILE.name.toUpperCase(), CONTENT_W);
  doc.text(nameLines, center, y, { align: "center" });
  y += 6.5 * nameLines.length;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const addr = doc.splitTextToSize(LAB_PROFILE.address, CONTENT_W);
  doc.text(addr, center, y, { align: "center" });
  y += 4 * addr.length + 2;

  // ---- Doctor / logo / timings ----------------------------------------
  const logo = await loadLogo();
  const logoSize = 22;
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

  y = top + logoSize + 2;
  rule(0.5, 4);

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
    const rowY = y + Math.floor(i / 2) * 4.5;
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, x, rowY);
    const lw = doc.getTextWidth(`${label}: `);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(value, 62 - lw), x + lw, rowY);
  });
  y += Math.ceil(pairs.length / 2) * 4.5 + 2;

  // ---- Test table -------------------------------------------------------
  const col = {
    number: M,
    test: M + TABLE_WIDTHS.number,
    rate: M + TABLE_WIDTHS.number + TABLE_WIDTHS.test,
    amount: M + TABLE_WIDTHS.number + TABLE_WIDTHS.test + TABLE_WIDTHS.rate,
    lab:
      M +
      TABLE_WIDTHS.number +
      TABLE_WIDTHS.test +
      TABLE_WIDTHS.rate +
      TABLE_WIDTHS.amount,
  };

  const drawTableHeader = () => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.line(M, y, right, y);
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("#", col.number + CELL_PAD_X, y);
    doc.text("Test", col.test + CELL_PAD_X, y);
    doc.text("Rate", col.amount - CELL_PAD_X, y, { align: "right" });
    doc.text("Amount", col.lab - CELL_PAD_X, y, { align: "right" });
    doc.text("Outsourced to", col.lab + CELL_PAD_X, y);
    y += 2;
    doc.line(M, y, right, y);
    y += 0.6;
  };

  const measuredRows = bill.items.map((it) => {
    const testLines = doc.splitTextToSize(
      it.testName,
      TABLE_WIDTHS.test - 2 * CELL_PAD_X,
    ) as string[];
    const labLines = doc.splitTextToSize(
      it.outsourcedLab || "-",
      TABLE_WIDTHS.lab - 2 * CELL_PAD_X,
    ) as string[];
    const lineCount = Math.max(testLines.length, labLines.length, 1);
    return {
      item: it,
      testLines,
      labLines,
      height: lineCount * ROW_LINE_H + 2 * CELL_PAD_Y,
    };
  });

  drawTableHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  measuredRows.forEach((row, i) => {
    if (y + row.height > PAGE_BOTTOM) {
      doc.addPage("a5", "portrait");
      y = M;
      drawTableHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }

    const rowTop = y;
    const baseline = rowTop + CELL_PAD_Y + 2.8;
    const textOptions = { lineHeightFactor: 1.17 };
    doc.text(String(i + 1), col.number + CELL_PAD_X, baseline);
    doc.text(row.testLines, col.test + CELL_PAD_X, baseline, textOptions);
    doc.text(Number(row.item.rate).toFixed(2), col.amount - CELL_PAD_X, baseline, {
      align: "right",
    });
    doc.text(Number(row.item.amount).toFixed(2), col.lab - CELL_PAD_X, baseline, {
      align: "right",
    });
    doc.text(row.labLines, col.lab + CELL_PAD_X, baseline, textOptions);

    y = rowTop + row.height;
    doc.setDrawColor(170);
    doc.setLineWidth(0.1);
    doc.line(M, y, right, y);
    doc.setDrawColor(0);
  });

  y += 2;


  // ---- Amounts + words + signature (kept together on one page) ----------
  const wordsLabel = "Amount in Words: ";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const wlw = doc.getTextWidth(wordsLabel);
  doc.setFont("helvetica", "normal");
  const words = doc.splitTextToSize(bill.amountInWords, CONTENT_W - wlw) as string[];

  // Footer height without the signature breathing gap (the compressible part).
  const amountRowsH = 5 * 4.4;
  const wordsBlockH = 1 + 3.5 + ROW_LINE_H * words.length + 4;
  const signatureH = 4.5;
  const noteH = LAB_PROFILE.footerNote ? 6 : 0;
  const compactFooterH = amountRowsH + wordsBlockH + 3 + signatureH + noteH;
  let spaceLeft = PAGE_BOTTOM - y;
  let sigGap = Math.min(10, Math.max(3, spaceLeft - compactFooterH + 3));

  if (compactFooterH > spaceLeft) {
    doc.addPage("a5", "portrait");
    y = M;
    spaceLeft = PAGE_BOTTOM - y;
    sigGap = Math.min(10, Math.max(3, spaceLeft - compactFooterH + 3));
  }


  const boxX = center + 4;
  const amt = (label: string, value: string | number, bold = false) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${label}:`, boxX, y);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(money(value), right, y, { align: "right" });
    y += 4.4;
  };
  amt("Total Amount", bill.totalAmount);
  amt("Discount", bill.discount);
  amt("Net Amount", bill.netAmount, true);
  amt("Paid Amount", bill.paidAmount);
  amt("Balance Amount", bill.balanceAmount);

  y += 1;
  rule(0.3, 3.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(wordsLabel, M, y);
  doc.setFont("helvetica", "normal");
  doc.text(words, M + wlw, y);
  y += ROW_LINE_H * words.length;
  rule(0.3, 4);

  // ---- Signature ---------------------------------------------------------
  y += sigGap;
  doc.setLineWidth(0.2);
  doc.line(right - 45, y, right, y);
  y += 4.5;
  doc.setFontSize(8.5);
  doc.text("Authorized Signature", right - 22.5, y, { align: "center" });

  if (LAB_PROFILE.footerNote) {
    y += 8;
    doc.setFontSize(8);
    doc.text(LAB_PROFILE.footerNote, center, y, { align: "center" });
  }


  doc.save(`Bill-${bill.billNumber}-${bill.patientNameSnapshot.replace(/\s+/g, "_")}.pdf`);
}
