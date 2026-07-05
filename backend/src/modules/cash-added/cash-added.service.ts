import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnly, LedgerService, parseDateOnly } from '../ledger/ledger.service';

export interface CreateCashAddedInput {
  amount: number;
  notes?: string | null;
  date?: string | null;
  createdById: string;
}

@Injectable()
export class CashAddedService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  async create(input: CreateCashAddedInput) {
    if (!input.createdById) throw new BadRequestException('Login required');
    const day = input.date ? parseDateOnly(input.date) : dateOnly();
    const row = await this.prisma.cashAdded.create({
      data: {
        date: day,
        amount: new Prisma.Decimal(input.amount),
        notes: input.notes ?? null,
        createdById: input.createdById,
      },
    });
    void this.ledger.recompute(day).catch((e) => console.error('[cash-added.create] bg recompute', e));
    return row;
  }

  list(date?: string) {
    const day = date ? parseDateOnly(date) : dateOnly();
    return this.prisma.cashAdded.findMany({
      where: { date: day },
      orderBy: { createdAt: 'asc' },
    });
  }

  async remove(id: string) {
    const row = await this.prisma.cashAdded.delete({ where: { id } });
    void this.ledger.recompute(row.date).catch((e) => console.error('[cash-added.remove] bg recompute', e));
    return { ok: true };
  }
}
