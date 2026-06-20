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

  /** Recompute & persist closing balance for a given date. */
  async recompute(date: Date = dateOnly()) {
    const __t0 = Date.now();
    const ledger = await this.ensureToday(date);
    const dayStart = date;
    const dayEnd = new Date(date.getTime() + 24 * 3600 * 1000);

    const patients = await this.prisma.patient.findMany({
      where: { entryDate: dayStart },
      select: { advanceCash: true, advanceUpi: true, balanceCash: true, balanceUpi: true },
    });

    const collected = patients.reduce((sum, p) => {
      return sum
        .plus(p.advanceCash).plus(p.advanceUpi)
        .plus(p.balanceCash).plus(p.balanceUpi);
    }, new Prisma.Decimal(0));

    const expensesAgg = await this.prisma.expense.aggregate({
      where: { date: dayStart },
      _sum: { amount: true },
    });
    const expenses = expensesAgg._sum.amount ?? new Prisma.Decimal(0);

    const closing = new Prisma.Decimal(ledger.openingBalance).plus(collected).minus(expenses);
    return this.prisma.dailyLedger.update({
      where: { id: ledger.id },
      data: { closingBalance: closing },
    });
  }

  async todaySummary(today: Date = dateOnly()) {
    const ledger = await this.ensureToday(today);
    const recomputed = await this.recompute(today);

    const patients = await this.prisma.patient.findMany({
      where: { entryDate: today },
      orderBy: { dailySerial: 'asc' },
      include: { tests: { include: { test: true } } },
    });

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

    const expenses = await this.prisma.expense.findMany({
      where: { date: today },
      orderBy: { createdAt: 'asc' },
    });
    const expenseTotal = expenses.reduce((s, e) => s.plus(e.amount), new Prisma.Decimal(0));

    return {
      date: today,
      ledger: recomputed,
      patients,
      totals: { ...totals, expenses: expenseTotal, count: patients.length },
      expenses,
    };
  }
}
