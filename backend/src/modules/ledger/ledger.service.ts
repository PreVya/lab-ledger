import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Returns YYYY-MM-DD UTC date object (00:00:00) for a JS date. */
export function dateOnly(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Parse a YYYY-MM-DD string into a UTC date-only Date. Throws on bad input. */
export function parseDateOnly(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException('date must be YYYY-MM-DD');
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(date.getTime())) throw new BadRequestException('invalid date');
  return date;
}

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  /** Ensures a day's ledger row exists. Opening = previous closing or 0. */
  async ensureDay(day: Date = dateOnly()) {
    const existing = await this.prisma.dailyLedger.findUnique({ where: { date: day } });
    if (existing) return existing;
    const previous = await this.prisma.dailyLedger.findFirst({
      where: { date: { lt: day } },
      orderBy: { date: 'desc' },
    });
    const opening = previous ? new Prisma.Decimal(previous.closingBalance) : new Prisma.Decimal(0);
    return this.prisma.dailyLedger.create({
      data: { date: day, openingBalance: opening, closingBalance: opening },
    });
  }

  /** Back-compat alias. */
  ensureToday(today: Date = dateOnly()) { return this.ensureDay(today); }

  /**
   * Recompute & persist closing balance for a given date. Fire-and-forget from mutations.
   */
  async recompute(date: Date = dateOnly()) {
    const __t0 = Date.now();
    const [ledger, patients, expensesAgg] = await Promise.all([
      this.ensureDay(date),
      this.prisma.patient.findMany({
        where: { entryDate: date },
        select: { advanceCash: true, advanceUpi: true, balanceCash: true, balanceUpi: true },
      }),
      this.prisma.expense.aggregate({ where: { date }, _sum: { amount: true } }),
    ]);

    const collected = patients.reduce(
      (sum, p) => sum.plus(p.advanceCash).plus(p.advanceUpi).plus(p.balanceCash).plus(p.balanceUpi),
      new Prisma.Decimal(0),
    );
    const expenses = expensesAgg._sum.amount ?? new Prisma.Decimal(0);
    const closing = new Prisma.Decimal(ledger.openingBalance).plus(collected).minus(expenses);

    const updated = await this.prisma.dailyLedger.update({
      where: { id: ledger.id },
      data: { closingBalance: closing },
    });
    console.log(`[perf] ledger.recompute(${date.toISOString().slice(0, 10)}) ${Date.now() - __t0}ms`);
    return updated;
  }

  /**
   * Ledger summary for any date. Used by both /ledger/today and /ledger?date=...
   * Parallel fetch + inline closing calc; persists closing in background.
   */
  async summary(day: Date = dateOnly()) {
    const __tAll = Date.now();

    const [ledger, patients, expenses] = await Promise.all([
      this.ensureDay(day),
      this.prisma.patient.findMany({
        where: { entryDate: day },
        orderBy: { registerNumber: 'asc' },
        include: { tests: { include: { test: true } } },
      }),
      this.prisma.expense.findMany({
        where: { date: day },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const totals = patients.reduce(
      (acc, p) => {
        acc.total = acc.total.plus(p.total);
        acc.discount = acc.discount.plus(p.discount);
        acc.net = acc.net.plus(p.net);
        acc.collected = acc.collected
          .plus(p.advanceCash).plus(p.advanceUpi)
          .plus(p.balanceCash).plus(p.balanceUpi);
        acc.balance = acc.balance.plus(p.balance);
        return acc;
      },
      {
        total: new Prisma.Decimal(0),
        discount: new Prisma.Decimal(0),
        net: new Prisma.Decimal(0),
        collected: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(0),
      },
    );

    const expenseTotal = expenses.reduce((s, e) => s.plus(e.amount), new Prisma.Decimal(0));
    const closing = new Prisma.Decimal(ledger.openingBalance).plus(totals.collected).minus(expenseTotal);

    if (!new Prisma.Decimal(ledger.closingBalance).equals(closing)) {
      this.prisma.dailyLedger
        .update({ where: { id: ledger.id }, data: { closingBalance: closing } })
        .catch((err) => console.error('[ledger] background closingBalance update failed', err));
    }

    console.log(`[perf] ledger.summary(${day.toISOString().slice(0, 10)}) TOTAL ${Date.now() - __tAll}ms`);

    return {
      date: day,
      ledger: { ...ledger, closingBalance: closing },
      patients,
      totals: { ...totals, expenses: expenseTotal, count: patients.length },
      expenses,
    };
  }

  /** Back-compat alias. */
  todaySummary(today: Date = dateOnly()) { return this.summary(today); }
}
