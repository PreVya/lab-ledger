/**
 * Central ledger-start / register-numbering configuration.
 *
 * The software went live on 01-Aug-2026. No business/ledger transaction may
 * exist before that date, and FY 2026-27 continues the old manual register
 * (which had reached 1306), so the first software register number is 1307.
 */

/** Official ledger start date (IST calendar day), inclusive. */
export const LEDGER_START_DATE = '2026-08-01';

/** UTC-midnight Date matching the IST calendar day 2026-08-01. */
export const LEDGER_START_DAY = new Date(Date.UTC(2026, 7, 1));

/** Opening cash balance seeded on the very first ledger day. */
export const LEDGER_START_OPENING_CASH = 1020;

export const LEDGER_START_ERROR = 'Ledger entries are allowed only from 01-Aug-2026 onward.';

/** Sundays are clinic holidays — no ledger writes allowed. */
export const SUNDAY_BLOCKED_ERROR =
  'Sunday / Clinic Holiday. Ledger entries are blocked for this date.';

/** true when the given date-only Date is a Sunday (UTC-midnight = IST calendar day). */
export function isSunday(d: Date): boolean {
  return d.getUTCDay() === 0;
}

/** true when the given date-only Date falls before the official ledger start. */
export function isBeforeLedgerStart(d: Date): boolean {
  return d.getTime() < LEDGER_START_DAY.getTime();
}

export function isLedgerStartDay(d: Date): boolean {
  return d.getTime() === LEDGER_START_DAY.getTime();
}

/**
 * First register number for a financial year when that FY has no patients yet.
 * FY 2026-27 carries forward from the paper register; every other FY starts at 1.
 */
export function getRegisterStartNumber(financialYear: string): number {
  if (financialYear === '2026-27') return 1307;
  return 1;
}
