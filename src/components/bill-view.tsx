import { LAB_PROFILE } from "@/lib/lab-profile";
import type { Bill } from "@/lib/types";

function money(v: string | number) {
  return `Rs. ${Number(v).toFixed(2)}`;
}

/**
 * Printable A5 (148mm x 210mm) pathology bill.
 * Wrapped in `.bill-sheet` — print CSS lives in src/styles.css.
 * Header text: src/lib/lab-profile.ts · Logo image: public/pratham-logo.png
 */
export function BillView({ bill }: { bill: Bill }) {
  return (
    <div className="bill-sheet mx-auto bg-white p-[8mm] text-[12px] leading-normal text-black">
      {/* ---- Header ---- */}
      <header className="text-center">
        <h1
          className="text-[25px] font-extrabold uppercase tracking-[0.5px]"
          style={{ fontFamily: '"Segoe UI", Arial, Helvetica, sans-serif' }}
        >
          {LAB_PROFILE.name}
        </h1>
        <p className="mt-0.5 text-[11px]">{LAB_PROFILE.address}</p>
      </header>

      {/* ---- Doctor / logo / timings ---- */}
      <div
        className="mt-2 grid items-center gap-x-3"
        style={{ gridTemplateColumns: "1fr auto 1fr" }}
      >
        <div className="text-[11px] leading-snug">
          <div className="font-bold">{LAB_PROFILE.doctorName}</div>
          <div>{LAB_PROFILE.doctorDesignation}</div>
        </div>
        <div className="flex justify-center">
          <img
            src={LAB_PROFILE.logoUrl}
            alt={`${LAB_PROFILE.name} logo`}
            className="object-contain"
            style={{ width: "26mm", height: "26mm" }}
          />
        </div>
        <div className="text-right text-[11px] leading-snug">
          <div>
            <span className="font-bold">Lab Timings: </span>
            <span>{LAB_PROFILE.timingsValue}</span>
          </div>
          <div>{LAB_PROFILE.timingsLine2}</div>
        </div>
      </div>

      <hr className="mt-2 border-t-2 border-black" />

      {/* ---- Bill & patient details ---- */}
      <section className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-[12px]">
        <Row label="Bill No." value={String(bill.billNumber)} />
        <Row label="Bill Date" value={bill.billDate.slice(0, 10)} />
        <Row label="Patient Reg No." value={String(bill.patientRegisterNumberSnapshot)} />
        <Row label="Patient FY" value={bill.patientFinancialYearSnapshot} />
        <Row label="Patient" value={bill.patientNameSnapshot} />
        <Row label="Age / Sex" value={`${bill.patientAgeSnapshot} / ${bill.patientSexSnapshot}`} />
        {bill.patientMobileSnapshot && <Row label="Mobile" value={bill.patientMobileSnapshot} />}
        {bill.referredDoctorSnapshot && (
          <Row label="Referred By" value={bill.referredDoctorSnapshot} />
        )}
      </section>

      {/* ---- Tests ---- */}
      <table className="bill-table mt-3 w-full border-collapse text-[12px]">
        <colgroup>
          <col className="bill-col-number" />
          <col className="bill-col-test" />
          <col className="bill-col-rate" />
          <col className="bill-col-amount" />
          <col className="bill-col-lab" />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Test</th>
            <th className="text-right">Rate</th>
            <th className="text-right">Amount</th>
            <th>Outsourced to</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((it, i) => (
            <tr key={it.id}>
              <td>{i + 1}</td>
              <td>{it.testName}</td>
              <td className="text-right tabular-nums">{Number(it.rate).toFixed(2)}</td>
              <td className="text-right tabular-nums">{Number(it.amount).toFixed(2)}</td>
              <td>{it.outsourcedLab || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---- Amount summary + words + signature: kept together ---- */}
      <div className="bill-footer-block">
        <section className="mt-3 ml-auto w-[70%] text-[12px]">
          <Amount label="Total Amount" value={bill.totalAmount} />
          <Amount label="Discount" value={bill.discount} />
          <Amount label="Net Amount" value={bill.netAmount} strong />
          <Amount label="Paid Amount" value={bill.paidAmount} />
          <Amount label="Balance Amount" value={bill.balanceAmount} />
        </section>

        <div className="mt-2 border-y border-black py-1.5 text-[12px]">
          <span className="font-bold">Amount in Words: </span>
          <span>{bill.amountInWords}</span>
        </div>

        {/* ---- Signature ---- */}
        <div className="mt-[14mm] flex justify-end">
          <div className="w-[55mm] border-t border-black pt-1 text-center text-[11px]">
            Authorized Signature
          </div>
        </div>

        {LAB_PROFILE.footerNote && (
          <p className="mt-3 text-center text-[10px]">{LAB_PROFILE.footerNote}</p>
        )}
      </div>
    </div>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="font-bold">{label}:</span>
      <span className="flex-1">{value}</span>
    </div>
  );
}

function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between border-b border-black/15 py-0.5">
      <span className="font-bold">{label}:</span>
      <span className={`tabular-nums ${strong ? "font-bold" : ""}`}>{money(value)}</span>
    </div>
  );
}
