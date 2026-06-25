import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * IST (Asia/Kolkata, UTC+5:30) business-date helpers.
 *
 * The lab runs on Indian Standard Time. All "date-only" columns
 * (Patient.entryDate, Expense.date, Payment.date, DailyLedger.date)
 * must represent the IST calendar day, NOT the UTC day. Otherwise the
 * register and ledger jump a day around midnight IST (= 18:30 UTC).
 *
 * We canonicalize an IST calendar day as a JS Date at UTC midnight whose
 * Y/M/D components equal the IST Y/M/D. Prisma's @db.Date then stores
 * exactly that calendar date. The frontend uses the same convention
 * (see src/lib/queries.ts -> todayKey()).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's IST business date as a UTC-midnight Date matching the IST Y/M/D. */
export function dateOnly(d: Date = new Date()): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** Parse a YYYY-MM-DD string (an IST calendar date) into a UTC-midnight Date. */
export function parseDateOnly(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException('date must be YYYY-MM-DD');
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(date.getTime())) throw new BadRequestException('invalid date');
  return date;
}

/** Format an IST-canonical Date as YYYY-MM-DD. */
export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
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
   *
   * Collection is summed from the Payment audit log by actual payment date,
   * NOT from Patient buckets filtered by entryDate. A balance paid later
   * is credited to that later date's ledger.
   */
  async recompute(date: Date = dateOnly()) {
    const __t0 = Date.now();
    const [ledger, paymentsAgg, expensesAgg] = await Promise.all([
      this.ensureDay(date),
      this.prisma.payment.aggregate({ where: { date }, _sum: { amount: true } }),
      this.prisma.expense.aggregate({ where: { date }, _sum: { amount: true } }),
    ]);

    const collected = paymentsAgg._sum.amount ?? new Prisma.Decimal(0);
    const expenses = expensesAgg._sum.amount ?? new Prisma.Decimal(0);
    const closing = new Prisma.Decimal(ledger.openingBalance).plus(collected).minus(expenses);

    const updated = await this.prisma.dailyLedger.update({
      where: { id: ledger.id },
      data: { closingBalance: closing },
    });
    console.log(`[perf] ledger.recompute(${formatDateOnly(date)}) ${Date.now() - __t0}ms`);
    return updated;
  }

  /**
   * Ledger summary for any date. Used by both /ledger/today and /ledger?date=...
   *
   * - patients[]: those whose entryDate == day (the day's register).
   * - totals.total/discount/net/balance: derived from that day's patients (billing-side).
   * - totals.collected: sum of Payment.amount where Payment.date == day
   *   (payment-side; includes balance payments collected today from older patients).
   * - expenses: that day's expenses.
   * - payments: today's payment rows (with patient summary) for UI display.
   */
  async summary(day: Date = dateOnly()) {
    const __tAll = Date.now();

    const [ledger, patients, expenses, paymentsAgg, paymentsToday] = await Promise.all([
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
      this.prisma.payment.aggregate({ where: { date: day }, _sum: { amount: true } }),
      this.prisma.payment.findMany({
        where: { date: day },
        orderBy: { createdAt: 'asc' },
        include: {
          patient: {
            select: {
              id: true, name: true, mobile: true,
              registerNumber: true, dailySerial: true, entryDate: true,
            },
          },
        },
      }),
    ]);

    const collected = paymentsAgg._sum.amount ?? new Prisma.Decimal(0);

    const totals = patients.reduce(
      (acc, p) => {
        acc.total = acc.total.plus(p.total);
        acc.discount = acc.discount.plus(p.discount);
        acc.net = acc.net.plus(p.net);
        acc.balance = acc.balance.plus(p.balance);
        return acc;
      },
      {
        total: new Prisma.Decimal(0),
        discount: new Prisma.Decimal(0),
        net: new Prisma.Decimal(0),
        collected,
        balance: new Prisma.Decimal(0),
      },
    );

    const expenseTotal = expenses.reduce((s, e) => s.plus(e.amount), new Prisma.Decimal(0));
    const closing = new Prisma.Decimal(ledger.openingBalance).plus(collected).minus(expenseTotal);

    if (!new Prisma.Decimal(ledger.closingBalance).equals(closing)) {
      this.prisma.dailyLedger
        .update({ where: { id: ledger.id }, data: { closingBalance: closing } })
        .catch((err) => console.error('[ledger] background closingBalance update failed', err));
    }

    console.log(`[perf] ledger.summary(${formatDateOnly(day)}) TOTAL ${Date.now() - __tAll}ms`);

    return {
      date: day,
      ledger: { ...ledger, closingBalance: closing },
      patients,
      totals: { ...totals, expenses: expenseTotal, count: patients.length },
      expenses,
      payments: paymentsToday,
    };
  }

  /** Back-compat alias. */
  todaySummary(today: Date = dateOnly()) { return this.summary(today); }
}
