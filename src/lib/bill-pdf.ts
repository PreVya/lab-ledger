import { jsPDF } from "jspdf";
import { LAB_PROFILE } from "./lab-profile";
import type { Bill } from "./types";

/** 80mm-wide "shop bill" style slip, continuous height. */
const W = 80; // mm
const M = 5; // margin mm

function money(v: string | number) {
  return Number(v).toFixed(2);
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
  const estimated = 150 + bill.items.length * 6;
  const doc = new jsPDF({ unit: "mm", format: [W, estimated] });
  let y = M + 2;

  const center = W / 2;
  const right = W - M;

  const line = () => {
    doc.setLineWidth(0.2);
    doc.line(M, y, right, y);
    y += 3;
  };
  const text = (s: string, x: number, opts?: { align?: "left" | "center" | "right" }) =>
    doc.text(s, x, y, { align: opts?.align ?? "left" });

  // ---- Header --------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(doc.splitTextToSize(LAB_PROFILE.name, W - 2 * M), center, y, { align: "center" });
  y += 4.5 * Math.max(1, doc.splitTextToSize(LAB_PROFILE.name, W - 2 * M).length);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const addr = doc.splitTextToSize(LAB_PROFILE.address, W - 2 * M);
  doc.text(addr, center, y, { align: "center" });
  y += 3 * addr.length + 1;

  // logo centred, doctor left, timings right
  const logo = await loadLogo();
  const logoSize = 16;
  const blockTop = y;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", center - logoSize / 2, blockTop, logoSize, logoSize);
    } catch { /* ignore logo failures */ }
  }
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text(doc.splitTextToSize(LAB_PROFILE.doctorName, 22), M, blockTop + 4);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(LAB_PROFILE.doctorDesignation, 22), M, blockTop + 7);
  doc.text(doc.splitTextToSize(LAB_PROFILE.timingsLine1, 22), right, blockTop + 4, { align: "right" });
  doc.text(doc.splitTextToSize(LAB_PROFILE.timingsLine2, 22), right, blockTop + 7, { align: "right" });
  y = blockTop + logoSize + 3;

  line();

  // ---- Bill identity --------------------------------------------------
  doc.setFontSize(7.5);
  const kv = (l: string, v: string) => {
    doc.setFont("helvetica", "normal");
    text(l, M);
    doc.setFont("helvetica", "bold");
    text(v, right, { align: "right" });
    y += 3.6;
  };
  kv("Bill No.", String(bill.billNumber));
  kv("Bill Date", bill.billDate.slice(0, 10));
  kv("Patient Reg No.", String(bill.patientRegisterNumberSnapshot));
  kv("Patient FY", bill.patientFinancialYearSnapshot);
  kv("Patient", bill.patientNameSnapshot);
  kv("Age / Sex", `${bill.patientAgeSnapshot} / ${bill.patientSexSnapshot}`);
  if (bill.patientMobileSnapshot) kv("Mobile", bill.patientMobileSnapshot);
  if (bill.referredDoctorSnapshot) kv("Referred by", bill.referredDoctorSnapshot);

  line();

  // ---- Items table -----------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  text("#", M);
  text("Test", M + 5);
  text("Rate", right - 14, { align: "right" });
  text("Amount", right, { align: "right" });
  y += 3;
  line();

  doc.setFont("helvetica", "normal");
  bill.items.forEach((it, i) => {
    const nameLines = doc.splitTextToSize(it.testName, 36);
    text(String(i + 1), M);
    doc.text(nameLines, M + 5, y);
    text(money(it.rate), right - 14, { align: "right" });
    text(money(it.amount), right, { align: "right" });
    y += 3.2 * nameLines.length;
    const meta = [it.testCode, it.outsourcedLab].filter(Boolean).join(" · ");
    if (meta) {
      doc.setFontSize(6);
      doc.text(meta, M + 5, y);
      doc.setFontSize(7);
      y += 3;
    }
    y += 0.6;
  });

  y += 1;
  line();

  // ---- Amounts ---------------------------------------------------------
  doc.setFontSize(7.5);
  const amt = (l: string, v: string | number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    text(l, M);
    text(`Rs. ${money(v)}`, right, { align: "right" });
    y += 3.8;
  };
  amt("Total Amount", bill.totalAmount);
  amt("Discount", bill.discount);
  amt("Net Amount", bill.netAmount, true);
  amt("Paid Amount", bill.paidAmount);
  if (Number(bill.balanceAmount) !== 0) amt("Balance Amount", bill.balanceAmount, true);

  line();

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.8);
  const words = doc.splitTextToSize(bill.amountInWords, W - 2 * M);
  doc.text(words, M, y);
  y += 3.2 * words.length + 8;

  // ---- Signature -------------------------------------------------------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.line(right - 30, y, right, y);
  y += 3.5;
  doc.text("Authorized Signature", right, y, { align: "right" });
  y += 6;

  if (LAB_PROFILE.footerNote) {
    doc.setFontSize(7);
    doc.text(LAB_PROFILE.footerNote, center, y, { align: "center" });
    y += 5;
  }

  doc.save(`Bill-${bill.billNumber}-${bill.patientNameSnapshot.replace(/\s+/g, "_")}.pdf`);
}
