/**
 * Financial-year helpers for patient/register numbering.
 * FY runs 1 April → 31 March. Format: "YYYY-YY" e.g. "2026-27".
 */
export function financialYearFor(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1..12
  const start = m >= 4 ? y : y - 1;
  const endShort = String((start + 1) % 100).padStart(2, '0');
  return `${start}-${endShort}`;
}
