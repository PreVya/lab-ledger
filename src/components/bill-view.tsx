import { LAB_PROFILE } from "@/lib/lab-profile";
import type { Bill } from "@/lib/types";

function money(v: string | number) {
  return `₹${Number(v).toFixed(2)}`;
}

/**
 * Printable bill sheet. Sized for a narrow "shop bill" slip (80mm).
 * Wrapped in `.bill-sheet` — print CSS in src/styles.css hides everything else.
 */
export function BillView({ bill }: { bill: Bill }) {
  return (
    <div className="bill-sheet mx-auto bg-white p-4 text-[11px] leading-tight text-black">
      {/* Header — edit contents in src/lib/lab-profile.ts, logo at src/assets/lab-logo.png */}
      <header className="text-center">
        <h1 className="text-base font-bold uppercase tracking-wide">{LAB_PROFILE.name}</h1>
        <p className="mt-0.5 text-[9px] font-normal">{LAB_PROFILE.address}</p>

        <div className="mt-2 grid grid-cols-3 items-center gap-1">
          <div className="text-left text-[9px]">
            <div className="font-bold">{LAB_PROFILE.doctorName}</div>
            <div className="font-normal">{LAB_PROFILE.doctorDesignation}</div>
          </div>
          <div className="flex justify-center">
            <img
              src={LAB_PROFILE.logoUrl}
              alt={`${LAB_PROFILE.name} logo`}
              width={64}
              height={64}
              loading="lazy"
              className="h-16 w-16 object-contain"
            />
          </div>
          <div className="text-right text-[9px] font-normal">
            <div>{LAB_PROFILE.timingsLine1}</div>
            <div>{LAB_PROFILE.timingsLine2}</div>
          </div>
        </div>
      </header>

      <hr className="my-2 border-black" />

      {/* Bill identity */}
      <section className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <Row label="Bill No." value={String(bill.billNumber)} strong />
        <Row label="Bill Date" value={bill.billDate.slice(0, 10)} />
        <Row label="Patient Reg No." value={String(bill.patientRegisterNumberSnapshot)} />
        <Row label="Patient FY" value={bill.patientFinancialYearSnapshot} />
        <Row label="Patient" value={bill.patientNameSnapshot} strong />
        <Row label="Age / Sex" value={`${bill.patientAgeSnapshot} / ${bill.patientSexSnapshot}`} />
        {bill.patientMobileSnapshot && <Row label="Mobile" value={bill.patientMobileSnapshot} />}
        {bill.referredDoctorSnapshot && <Row label="Referred by" value={bill.referredDoctorSnapshot} />}
      </section>

      <hr className="my-2 border-black" />

      {/* Items */}
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1 text-left">#</th>
            <th className="py-1 text-left">Test</th>
            <th className="py-1 text-right">Rate</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((it, i) => (
            <tr key={it.id} className="border-b border-dotted border-black/40 align-top">
              <td className="py-1">{i + 1}</td>
              <td className="py-1">
                <div>{it.testName}</div>
                {(it.testCode || it.outsourcedLab) && (
                  <div className="text-[8px]">
                    {[it.testCode, it.outsourcedLab].filter(Boolean).join(" · ")}
                  </div>
                )}
              </td>
              <td className="py-1 text-right tabular-nums">{money(it.rate)}</td>
              <td className="py-1 text-right tabular-nums">{money(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Amounts */}
      <section className="mt-2 space-y-0.5">
        <Amount label="Total Amount" value={bill.totalAmount} />
        <Amount label="Discount" value={bill.discount} />
        <Amount label="Net Amount" value={bill.netAmount} strong />
        <Amount label="Paid Amount" value={bill.paidAmount} />
        {Number(bill.balanceAmount) !== 0 && (
          <Amount label="Balance Amount" value={bill.balanceAmount} strong />
        )}
      </section>

      <hr className="my-2 border-black" />
      <p className="italic">{bill.amountInWords}</p>

      {/* Signature */}
      <div className="mt-10 flex justify-end">
        <div className="w-40 border-t border-black pt-1 text-right text-[9px]">
          Authorized Signature
        </div>
      </div>

      {LAB_PROFILE.footerNote && (
        <p className="mt-4 text-center text-[9px]">{LAB_PROFILE.footerNote}</p>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className={strong ? "font-bold" : ""}>{value}</span>
    </div>
  );
}

function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );
}
