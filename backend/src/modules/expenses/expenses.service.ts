import { Injectable } from '@nestjs/common';
import { PaymentMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnly, LedgerService } from '../ledger/ledger.service';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  async create(input: { description: string; amount: number; mode: PaymentMode }) {
    const today = dateOnly();
    const __tDb = Date.now();
    const e = await this.prisma.expense.create({
      data: {
        date: today,
        description: input.description,
        amount: new Prisma.Decimal(input.amount),
        mode: input.mode,
      },
    });
    console.log(`[perf] expenses.create DB ${Date.now() - __tDb}ms`);
    const __tRecompute = Date.now();
    await this.ledger.recompute(today);
    console.log(`[perf] expenses.create ledger.recompute ${Date.now() - __tRecompute}ms`);
    return e;
  }

  async remove(id: string) {
    const e = await this.prisma.expense.delete({ where: { id } });
    await this.ledger.recompute(e.date);
    return { ok: true };
  }
}
