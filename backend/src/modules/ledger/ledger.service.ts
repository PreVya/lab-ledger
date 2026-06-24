import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Returns YYYY-MM-DD UTC date object (00:00:00) for a JS date. */
export function dateOnly(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  /** Ensures today's ledger row exists. Opening = previous closing or 0. */
  async ensureToday(today: Date = dateOnly()) {
    const existing = await this.prisma.dailyLedger.findUnique({ where: { date: today } });
    if (existing) return existing;
    const previous = await this.prisma.dailyLedger.findFirst({
      where: { date: { lt: today } },
      orderBy: { date: 'desc' },
    });
    const opening = previous ? new Prisma.Decimal(previous.closingBalance) : new Prisma.Decimal(0);
    return this.prisma.dailyLedger.create({
      data: { date: today, openingBalance: opening, closingBalance: opening },
    });
  }

  /**
   * Recompute & persist closing balance for a given date.
   * Kept for backwards compatibility (e.g. delete flows). Prefer todaySummary
   * which computes closing inline from already-fetched data.
   */
  async recompute(date: Date = dateOnly()) {
    const __t0 = Date.now();
    const [ledger, patients, expensesAgg] = await Promise.all([
      this.ensureToday(date),
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
    console.log(`[perf] ledger.recompute(${date.toISOString().slice(0,10)}) ${Date.now() - __t0}ms`);
    return updated;
  }

  /**
   * Optimized today summary:
   * - Parallel fetch of ledger row, patients (with tests), expenses
   * - Closing balance computed inline from in-memory data (no extra recompute round-trip)
   * - Ledger closingBalance persisted in background (fire-and-forget) so it doesn't block the response
   */
  async todaySummary(today: Date = dateOnly()) {
    const __tAll = Date.now();

    const [ledger, patients, expenses] = await Promise.all([
      this.ensureToday(today),
      this.prisma.patient.findMany({
        where: { entryDate: today },
        orderBy: { dailySerial: 'asc' },
        include: { tests: { include: { test: true } } },
      }),
      this.prisma.expense.findMany({
        where: { date: today },
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

    // Persist closing balance in the background — do NOT block the response.
    if (!new Prisma.Decimal(ledger.closingBalance).equals(closing)) {
      this.prisma.dailyLedger
        .update({ where: { id: ledger.id }, data: { closingBalance: closing } })
        .catch((err) => console.error('[ledger] background closingBalance update failed', err));
    }

    console.log(`[perf] todaySummary TOTAL ${Date.now() - __tAll}ms`);

    return {
      date: today,
      ledger: { ...ledger, closingBalance: closing },
      patients,
      totals: { ...totals, expenses: expenseTotal, count: patients.length },
      expenses,
    };
  }
}

