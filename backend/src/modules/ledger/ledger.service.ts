import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
   * Ensure DailyLedger row for given day. Opening = previous day's closing
   * (cash-only since Phase 1.75) or 0 if no prior row.
   */
  async ensureDay(day: Date = dateOnly()) {
    const existing = await this.prisma.dailyLedger.findUnique({ where: { date: day } });
    if (existing) return existing;
    const previous = await this.prisma.dailyLedger.findFirst({
      where: { date: { lt: day } },
      orderBy: { date: 'desc' },
    });
    const opening = previous ? new Prisma.Decimal(previous.closingBalance) : ZERO();
    return this.prisma.dailyLedger.create({
      data: { date: day, openingBalance: opening, closingBalance: opening },
    });
  }

  ensureToday(today: Date = dateOnly()) { return this.ensureDay(today); }

  /** Recompute & persist closing CASH balance for the given date. */
  async recompute(date: Date = dateOnly()) {
    const __t0 = Date.now();
    const [ledger, payments, expenses, handovers, added] = await Promise.all([
      this.ensureDay(date),
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

    const closingCash = new Prisma.Decimal(ledger.openingBalance)
      .plus(cashCollected)
      .minus(cashExpenses)
      .minus(takenAway)
      .plus(addedCash);

    const updated = await this.prisma.dailyLedger.update({
      where: { id: ledger.id },
      data: { closingBalance: closingCash },
    });
    console.log(`[perf] ledger.recompute(${formatDateOnly(date)}) ${Date.now() - __t0}ms`);
    return updated;
  }

  /** Ledger summary for any date — drives Today Register UI. */
  async summary(day: Date = dateOnly()) {
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
        .catch((err) => console.error('[ledger] background closingBalance update failed', err));
    }

    console.log(`[perf] ledger.summary(${formatDateOnly(day)}) TOTAL ${Date.now() - __tAll}ms`);

    return {
      date: day,
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
