import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnly, LedgerService, parseDateOnly } from '../ledger/ledger.service';

export interface CreateCashHandoverInput {
  amount: number;
  notes?: string | null;
  date?: string | null;
  createdById: string;
}

@Injectable()
export class CashHandoverService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  async create(input: CreateCashHandoverInput) {
    if (!input.createdById) throw new BadRequestException('Login required');
    const day = input.date ? parseDateOnly(input.date) : dateOnly();
    const row = await this.prisma.cashHandover.create({
      data: {
        date: day,
        amount: new Prisma.Decimal(input.amount),
        notes: input.notes ?? null,
        createdById: input.createdById,
      },
    });
    void this.ledger.recompute(day).catch((e) => console.error('[cash-handover.create] bg recompute', e));
    return row;
  }

  list(date?: string) {
    const day = date ? parseDateOnly(date) : dateOnly();
    return this.prisma.cashHandover.findMany({
      where: { date: day },
      orderBy: { createdAt: 'asc' },
    });
  }

  async remove(id: string) {
    const row = await this.prisma.cashHandover.delete({ where: { id } });
    void this.ledger.recompute(row.date).catch((e) => console.error('[cash-handover.remove] bg recompute', e));
    return { ok: true };
  }
}
