import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TeaCoffeeItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertLedgerDate, dateOnly, parseDateOnly } from '../ledger/ledger.service';
import { ExpensesService } from '../expenses/expenses.service';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseMonth(month: string): { year: number; month: number; start: Date; end: Date; label: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('month must be YYYY-MM');
  const [y, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) throw new BadRequestException('month must be YYYY-MM');
  return {
    year: y,
    month: m,
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
    label: `${MONTH_NAMES[m - 1]} ${y}`,
  };
}

@Injectable()
export class TeaCoffeeService {
  constructor(private prisma: PrismaService, private expenses: ExpensesService) {}

  // ---- Rates -------------------------------------------------------------

  /** Rates are seeded by migration; this self-heals if a row is missing. */
  async rates() {
    const defaults: Array<{ item: TeaCoffeeItem; rate: number }> = [
      { item: 'tea', rate: 10 },
      { item: 'coffee', rate: 20 },
    ];
    for (const d of defaults) {
      const found = await this.prisma.teaCoffeeRate.findUnique({ where: { item: d.item } });
      if (!found) {
        await this.prisma.teaCoffeeRate.create({
          data: {
            item: d.item,
            rate: new Prisma.Decimal(d.rate),
            effectiveFrom: dateOnly(),
          },
        });
      }
    }
    return this.prisma.teaCoffeeRate.findMany({ orderBy: { item: 'asc' } });
  }

  async updateRate(item: TeaCoffeeItem, rate: number, effectiveFrom?: string) {
    await this.rates();
    return this.prisma.teaCoffeeRate.update({
      where: { item },
      data: {
        rate: new Prisma.Decimal(rate),
        effectiveFrom: effectiveFrom ? parseDateOnly(effectiveFrom) : dateOnly(),
      },
    });
  }

  private async rateFor(item: TeaCoffeeItem): Promise<number> {
    const rows = await this.rates();
    const hit = rows.find((r) => r.item === item);
    return hit ? Number(hit.rate) : 0;
  }

  // ---- Daily entries (consumption tracking only — NEVER touches ledger) ---

  async listEntries(date?: string) {
    const day = date ? parseDateOnly(date) : dateOnly();
    const entries = await this.prisma.teaCoffeeEntry.findMany({
      where: { date: day },
      include: { employee: { select: { id: true, name: true, designation: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const teaQty = entries.filter((e) => e.item === 'tea').reduce((s, e) => s + e.quantity, 0);
    const coffeeQty = entries.filter((e) => e.item === 'coffee').reduce((s, e) => s + e.quantity, 0);
    const totalAmount = entries.reduce((s, e) => s + Number(e.amount), 0);
    return {
      date: day.toISOString().slice(0, 10),
      entries,
      totals: { teaQty, coffeeQty, totalAmount: totalAmount.toFixed(2) },
    };
  }

  async createEntry(input: {
    date?: string; employeeId: string; item: TeaCoffeeItem; quantity?: number;
    rate?: number; createdById?: string | null;
  }) {
    const day = input.date ? parseDateOnly(input.date) : dateOnly();
    const employee = await this.prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const quantity = Math.max(1, Math.trunc(input.quantity ?? 1));
    const rate = input.rate != null && input.rate >= 0 ? input.rate : await this.rateFor(input.item);
    return this.prisma.teaCoffeeEntry.create({
      data: {
        date: day,
        employeeId: input.employeeId,
        item: input.item,
        quantity,
        rateAtTime: new Prisma.Decimal(rate),
        amount: new Prisma.Decimal(rate * quantity),
        createdById: input.createdById ?? null,
      },
      include: { employee: { select: { id: true, name: true, designation: true } } },
    });
  }

  async updateEntry(id: string, input: {
    date?: string; employeeId?: string; item?: TeaCoffeeItem; quantity?: number; rate?: number;
  }) {
    const row = await this.prisma.teaCoffeeEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Entry not found');
    const quantity = input.quantity != null ? Math.max(1, Math.trunc(input.quantity)) : row.quantity;
    const rate = input.rate != null && input.rate >= 0 ? input.rate : Number(row.rateAtTime);
    return this.prisma.teaCoffeeEntry.update({
      where: { id },
      data: {
        date: input.date ? parseDateOnly(input.date) : row.date,
        employeeId: input.employeeId ?? row.employeeId,
        item: input.item ?? row.item,
        quantity,
        rateAtTime: new Prisma.Decimal(rate),
        amount: new Prisma.Decimal(rate * quantity),
      },
      include: { employee: { select: { id: true, name: true, designation: true } } },
    });
  }

  async removeEntry(id: string) {
    const row = await this.prisma.teaCoffeeEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Entry not found');
    await this.prisma.teaCoffeeEntry.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Monthly bill ------------------------------------------------------

  /** Live totals for the consumption month + stored payment status (if any). */
  async monthlyBill(month: string) {
    const { start, end, label } = parseMonth(month);
    const entries = await this.prisma.teaCoffeeEntry.findMany({
      where: { date: { gte: start, lt: end } },
    });
    const teaCount = entries.filter((e) => e.item === 'tea').reduce((s, e) => s + e.quantity, 0);
    const coffeeCount = entries.filter((e) => e.item === 'coffee').reduce((s, e) => s + e.quantity, 0);
    const teaAmount = entries.filter((e) => e.item === 'tea').reduce((s, e) => s + Number(e.amount), 0);
    const coffeeAmount = entries.filter((e) => e.item === 'coffee').reduce((s, e) => s + Number(e.amount), 0);

    const bill = await this.prisma.teaCoffeeMonthlyBill.findUnique({ where: { billMonth: month } });
    const expense = bill?.expenseId
      ? await this.prisma.expense.findUnique({ where: { id: bill.expenseId } })
      : null;

    const paid = bill?.status === 'paid';
    return {
      billMonth: month,
      billMonthLabel: label,
      // Once paid, the stored snapshot is authoritative.
      teaCount: paid ? bill!.teaCount : teaCount,
      coffeeCount: paid ? bill!.coffeeCount : coffeeCount,
      teaAmount: (paid ? Number(bill!.teaAmount) : teaAmount).toFixed(2),
      coffeeAmount: (paid ? Number(bill!.coffeeAmount) : coffeeAmount).toFixed(2),
      totalAmount: (paid ? Number(bill!.totalAmount) : teaAmount + coffeeAmount).toFixed(2),
      liveTotalAmount: (teaAmount + coffeeAmount).toFixed(2),
      status: bill?.status ?? 'unpaid',
      paidDate: bill?.paidDate ? bill.paidDate.toISOString().slice(0, 10) : null,
      paidAmount: bill?.paidAmount != null ? Number(bill.paidAmount).toFixed(2) : null,
      notes: bill?.notes ?? null,
      id: bill?.id ?? null,
      expenseId: bill?.expenseId ?? null,
      expense: expense
        ? {
            id: expense.id,
            date: expense.date.toISOString().slice(0, 10),
            description: expense.description,
            amount: Number(expense.amount).toFixed(2),
            mode: expense.mode,
          }
        : null,
    };
  }

  /**
   * Marks a consumption month as paid and creates EXACTLY ONE cash Expense row
   * dated on the real payment date (which may sit in a later month). The
   * existing Expense flow is what touches the ledger — balances are never
   * written directly here.
   */
  async markPaid(input: { billMonth: string; paidDate: string; paidAmount?: number; notes?: string | null }) {
    const { label } = parseMonth(input.billMonth);
    const existing = await this.prisma.teaCoffeeMonthlyBill.findUnique({
      where: { billMonth: input.billMonth },
    });
    if (existing?.status === 'paid') {
      throw new BadRequestException(`Tea/Coffee bill for ${label} is already paid.`);
    }

    // Payment date must obey the same ledger rules as any other expense.
    if (!input.paidDate) throw new BadRequestException('Paid date is required.');
    assertLedgerDate(parseDateOnly(input.paidDate));

    const summary = await this.monthlyBill(input.billMonth);
    const total = Number(summary.liveTotalAmount);
    const paidAmount = input.paidAmount != null ? Number(input.paidAmount) : total;
    if (!(paidAmount > 0)) throw new BadRequestException('Paid amount must be greater than 0.');

    const snapshot = {
      teaCount: summary.teaCount,
      coffeeCount: summary.coffeeCount,
      teaAmount: new Prisma.Decimal(summary.teaAmount),
      coffeeAmount: new Prisma.Decimal(summary.coffeeAmount),
      totalAmount: new Prisma.Decimal(total),
      status: 'paid' as const,
      paidDate: parseDateOnly(input.paidDate),
      paidAmount: new Prisma.Decimal(paidAmount),
      notes: input.notes ?? null,
    };

    const bill = existing
      ? await this.prisma.teaCoffeeMonthlyBill.update({ where: { id: existing.id }, data: snapshot })
      : await this.prisma.teaCoffeeMonthlyBill.create({
          data: { billMonth: input.billMonth, ...snapshot },
        });

    // One bill = one expense. Guard again in case a row already exists.
    if (!bill.expenseId) {
      const expense = await this.expenses.create({
        description: `Tea/Coffee bill for month ${label} with bill id ${bill.id}`,
        amount: paidAmount,
        mode: 'cash',
        date: input.paidDate,
      });
      await this.prisma.teaCoffeeMonthlyBill.update({
        where: { id: bill.id },
        data: { expenseId: expense.id },
      });
    }

    return this.monthlyBill(input.billMonth);
  }
}
