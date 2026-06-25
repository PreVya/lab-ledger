/**
 * Financial-year helpers for patient/register numbering.
 * FY runs 1 April → 31 March (IST). Format: "YYYY-YY", e.g. "2026-27".
 *
 * IMPORTANT: callers must pass a Date that already represents the desired
 * IST calendar day (use ledger.dateOnly()). Because that Date is a
 * UTC-midnight Date whose Y/M/D match the IST day, reading getUTCFullYear /
 * getUTCMonth gives the correct IST components and avoids local-tz drift
 * on the server.
 */
export function financialYearFor(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1..12
  const start = m >= 4 ? y : y - 1;
  const endShort = String((start + 1) % 100).padStart(2, '0');
  return `${start}-${endShort}`;
}
