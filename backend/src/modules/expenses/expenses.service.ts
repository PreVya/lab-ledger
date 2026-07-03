import { Injectable } from '@nestjs/common';
import { PaymentMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnly, LedgerService, parseDateOnly } from '../ledger/ledger.service';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  async create(input: { description: string; amount: number; mode: PaymentMode; date?: string }) {
    const day = input.date ? parseDateOnly(input.date) : dateOnly();
    const __tDb = Date.now();
    const e = await this.prisma.expense.create({
      data: {
        date: day,
        description: input.description,
        amount: new Prisma.Decimal(input.amount),
        mode: input.mode,
      },
    });
    console.log(`[perf] expenses.create DB ${Date.now() - __tDb}ms`);
    // Fire-and-forget: do not block the response on full ledger recompute.
    // GET /ledger/today computes closing balance inline from fresh data.
    void this.ledger
      .recompute(today)
      .catch((err) => console.error('[expenses.create] background recompute failed', err));
    return e;
  }

  async remove(id: string) {
    const e = await this.prisma.expense.delete({ where: { id } });
    void this.ledger
      .recompute(e.date)
      .catch((err) => console.error('[expenses.remove] background recompute failed', err));
    return { ok: true };
  }
}
