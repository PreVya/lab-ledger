import { Injectable } from '@nestjs/common';
import { PaymentMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnly, LedgerService } from '../ledger/ledger.service';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  async create(input: { description: string; amount: number; mode: PaymentMode }) {
    const today = dateOnly();
    const e = await this.prisma.expense.create({
      data: {
        date: today,
        description: input.description,
        amount: new Prisma.Decimal(input.amount),
        mode: input.mode,
      },
    });
    await this.ledger.recompute(today);
    return e;
  }

  async remove(id: string) {
    const e = await this.prisma.expense.delete({ where: { id } });
    await this.ledger.recompute(e.date);
    return { ok: true };
  }
}
