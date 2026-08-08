import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LEDGER_START_ERROR,
  LEDGER_START_OPENING_CASH,
  SUNDAY_BLOCKED_ERROR,
  isBeforeLedgerStart,
  isLedgerStartDay,
  isSunday,
} from '../../config/ledger.config';

/** true when the date is not writable (before official start, or a Sunday holiday). */
export function isLedgerBlocked(d: Date): boolean {
  return isBeforeLedgerStart(d) || isSunday(d);
}

/** Throws when a business/ledger entry is attempted on a blocked date. */
export function assertLedgerDate(d: Date): Date {
  if (isBeforeLedgerStart(d)) throw new BadRequestException(LEDGER_START_ERROR);
  if (isSunday(d)) throw new BadRequestException(SUNDAY_BLOCKED_ERROR);
  return d;
}


/**
 * IST (Asia/Kolkata, UTC+5:30) business-date helpers.
 * See Phase 1.5 notes for rationale — all date-only columns store the IST
 * calendar day as a UTC-midnight Date whose Y/M/D match IST Y/M/D.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function dateOnly(d: Date = new Date()): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

export function parseDateOnly(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException('date must be YYYY-MM-DD');
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(date.getTime())) throw new BadRequestException('invalid date');
  return date;
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ZERO = () => new Prisma.Decimal(0);

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Ensure DailyLedger row for given day. Opening = previous VALID day's closing
   * cash (cash-only). On the official start day (01-Aug-2026) the opening cash is
   * the seeded carry-forward amount. Blocked dates never create a row.
   *
   * The opening balance is always re-synced from the previous valid day so it can
   * never go stale.
   */
  async ensureDay(day: Date = dateOnly()) {
    assertLedgerDate(day);
    const opening = await this.openingFor(day);
    const existing = await this.prisma.dailyLedger.findUnique({ where: { date: day } });
    if (existing) {
      if (new Prisma.Decimal(existing.openingBalance).equals(opening)) return existing;
      return this.prisma.dailyLedger.update({
        where: { id: existing.id },
        data: { openingBalance: opening },
      });
    }
    return this.prisma.dailyLedger.create({
      data: { date: day, openingBalance: opening, closingBalance: opening },
    });
  }

  /** Opening cash for a valid ledger day = previous valid day's closing (anchor on start day). */
  private async openingFor(day: Date): Promise<Prisma.Decimal> {
    if (isLedgerStartDay(day)) return new Prisma.Decimal(LEDGER_START_OPENING_CASH);
    const previous = await this.prisma.dailyLedger.findFirst({
      where: { date: { lt: day } },
      orderBy: { date: 'desc' },
    });
    if (previous) return new Prisma.Decimal(previous.closingBalance);
    return new Prisma.Decimal(LEDGER_START_OPENING_CASH);
  }

  ensureToday(today: Date = dateOnly()) { return this.ensureDay(today); }

  /** Cash-only closing balance for a day, given its opening balance. */
  private async closingFor(date: Date, opening: Prisma.Decimal) {
    const [payments, expenses, handovers, added] = await Promise.all([
      this.prisma.payment.findMany({ where: { date }, select: { amount: true, mode: true } }),
      this.prisma.expense.findMany({ where: { date }, select: { amount: true, mode: true } }),
      this.prisma.cashHandover.aggregate({ where: { date }, _sum: { amount: true } }),
      this.prisma.cashAdded.aggregate({ where: { date }, _sum: { amount: true } }),
    ]);
    const cashCollected = payments
      .filter((p) => p.mode === 'cash')
      .reduce((s, p) => s.plus(p.amount), ZERO());
    const cashExpenses = expenses
      .filter((e) => e.mode === 'cash')
      .reduce((s, e) => s.plus(e.amount), ZERO());
    const takenAway = handovers._sum.amount ?? ZERO();
    const addedCash = added._sum.amount ?? ZERO();
    return opening.plus(cashCollected).minus(cashExpenses).minus(takenAway).plus(addedCash);
  }

  /**
   * Recompute & persist closing CASH balance for the given date, then cascade the
   * new closing forward into every later valid ledger day.
   */
  async recompute(date: Date = dateOnly()) {
    if (isLedgerBlocked(date)) return null;
    const __t0 = Date.now();
    const ledger = await this.ensureDay(date);
    const closingCash = await this.closingFor(date, new Prisma.Decimal(ledger.openingBalance));

    const updated = await this.prisma.dailyLedger.update({
      where: { id: ledger.id },
      data: { closingBalance: closingCash },
    });
    await this.cascadeForward(date);
    console.log(`[perf] ledger.recompute(${formatDateOnly(date)}) ${Date.now() - __t0}ms`);
    return updated;
  }

  /**
   * Re-chain every existing DailyLedger row after `from`: opening = previous
   * valid day's closing, closing recomputed from that day's cash movements.
   * Blocked (pre-start / Sunday) rows are skipped and never created.
   */
  async cascadeForward(from: Date) {
    const later = await this.prisma.dailyLedger.findMany({
      where: { date: { gt: from } },
      orderBy: { date: 'asc' },
    });
    for (const row of later) {
      if (isLedgerBlocked(row.date)) continue;
      const opening = await this.openingFor(row.date);
      const closing = await this.closingFor(row.date, opening);
      if (
        new Prisma.Decimal(row.openingBalance).equals(opening) &&
        new Prisma.Decimal(row.closingBalance).equals(closing)
      ) {
        continue;
      }
      await this.prisma.dailyLedger.update({
        where: { id: row.id },
        data: { openingBalance: opening, closingBalance: closing },
      });
    }
  }

  /** One-time / on-demand repair: re-chain the whole ledger from the start date. */
  async repairAll() {
    const rows = await this.prisma.dailyLedger.findMany({ orderBy: { date: 'asc' } });
    for (const row of rows) {
      if (isLedgerBlocked(row.date)) continue;
      const opening = await this.openingFor(row.date);
      const closing = await this.closingFor(row.date, opening);
      await this.prisma.dailyLedger.update({
        where: { id: row.id },
        data: { openingBalance: opening, closingBalance: closing },
      });
    }
    return { ok: true, days: rows.length };
  }


  /**
   * Read-only zero summary for dates before the official ledger start.
   * IMPORTANT: never creates a DailyLedger row.
   */
  private blockedSummary(day: Date) {
    const z = ZERO();
    const sunday = isSunday(day);
    return {
      date: day,
      readonlyBlocked: true,
      isSunday: sunday,
      blockedReason: sunday && !isBeforeLedgerStart(day) ? SUNDAY_BLOCKED_ERROR : LEDGER_START_ERROR,
      ledger: { id: null, date: day, openingBalance: z, closingBalance: z, notes: null },
      patients: [] as any[],
      totals: {
        total: z, discount: z, net: z, balance: z,
        collected: z, cashCollected: z, upiCollected: z, cardCollected: z, otherCollected: z,
        expenses: z, cashExpenses: z, cashTakenAway: z, addedCash: z,
        openingCashBalance: z, closingCashBalance: z, count: 0,
      },
      expenses: [] as any[],
      payments: [] as any[],
      cashHandovers: [] as any[],
      cashAdded: [] as any[],
    };
  }

  /** Ledger summary for any date — drives Today Register UI. */
  async summary(day: Date = dateOnly()) {
    if (isLedgerBlocked(day)) return this.blockedSummary(day);
    const __tAll = Date.now();


    const [ledger, patients, expenses, paymentsToday, handovers, cashAddedEntries] = await Promise.all([
      this.ensureDay(day),
      this.prisma.patient.findMany({
        where: { entryDate: day },
        orderBy: { registerNumber: 'asc' },
        include: { tests: { include: { test: true } } },
      }),
      this.prisma.expense.findMany({ where: { date: day }, orderBy: { createdAt: 'asc' } }),
      this.prisma.payment.findMany({
        where: { date: day },
        orderBy: { createdAt: 'asc' },
        include: {
          patient: {
            select: {
              id: true, name: true, mobile: true,
              registerNumber: true, dailySerial: true, entryDate: true, financialYear: true,
            },
          },
        },
      }),
      this.prisma.cashHandover.findMany({ where: { date: day }, orderBy: { createdAt: 'asc' } }),
      this.prisma.cashAdded.findMany({ where: { date: day }, orderBy: { createdAt: 'asc' } }),
    ]);

    // Collection split by mode (from Payment audit log, by payment date).
    let cashCollected = ZERO(), upiCollected = ZERO(), cardCollected = ZERO(), otherCollected = ZERO();
    for (const p of paymentsToday) {
      const a = new Prisma.Decimal(p.amount);
      if (p.mode === 'cash') cashCollected = cashCollected.plus(a);
      else if (p.mode === 'upi') upiCollected = upiCollected.plus(a);
      else if (p.mode === 'card') cardCollected = cardCollected.plus(a);
      else otherCollected = otherCollected.plus(a);
    }
    const totalCollected = cashCollected.plus(upiCollected).plus(cardCollected).plus(otherCollected);

    // Expense split by mode.
    let cashExpenses = ZERO(), otherExpenses = ZERO();
    for (const e of expenses) {
      const a = new Prisma.Decimal(e.amount);
      if (e.mode === 'cash') cashExpenses = cashExpenses.plus(a);
      else otherExpenses = otherExpenses.plus(a);
    }
    const expenseTotal = cashExpenses.plus(otherExpenses);

    const cashTakenAway = handovers.reduce((s, h) => s.plus(h.amount), ZERO());
    const addedCash = cashAddedEntries.reduce((s, a) => s.plus(a.amount), ZERO());

    // Billing-side totals from today's register (entryDate==day).
    const billing = patients.reduce(
      (acc, p) => {
        acc.total = acc.total.plus(p.total);
        acc.discount = acc.discount.plus(p.discount);
        acc.net = acc.net.plus(p.net);
        acc.balance = acc.balance.plus(p.balance);
        return acc;
      },
      { total: ZERO(), discount: ZERO(), net: ZERO(), balance: ZERO() },
    );

    const openingCashBalance = new Prisma.Decimal(ledger.openingBalance);
    const closingCashBalance = openingCashBalance
      .plus(cashCollected)
      .minus(cashExpenses)
      .minus(cashTakenAway)
      .plus(addedCash);

    if (!new Prisma.Decimal(ledger.closingBalance).equals(closingCashBalance)) {
      this.prisma.dailyLedger
        .update({ where: { id: ledger.id }, data: { closingBalance: closingCashBalance } })
        .then(() => this.cascadeForward(day))
        .catch((err) => console.error('[ledger] background closingBalance update failed', err));
    }


    console.log(`[perf] ledger.summary(${formatDateOnly(day)}) TOTAL ${Date.now() - __tAll}ms`);

    return {
      date: day,
      readonlyBlocked: false,
      isSunday: false,
      ledger: { ...ledger, openingBalance: openingCashBalance, closingBalance: closingCashBalance },

      patients,
      totals: {
        ...billing,
        collected: totalCollected,
        cashCollected,
        upiCollected,
        cardCollected,
        otherCollected,
        expenses: expenseTotal,
        cashExpenses,
        cashTakenAway,
        addedCash,
        openingCashBalance,
        closingCashBalance,
        count: patients.length,
      },
      expenses,
      payments: paymentsToday,
      cashHandovers: handovers,
      cashAdded: cashAddedEntries,
    };
  }

  todaySummary(today: Date = dateOnly()) { return this.summary(today); }
}
