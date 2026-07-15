import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseDateOnly } from '../ledger/ledger.service';

@Injectable()
export class HolidaysService {
  constructor(private prisma: PrismaService) {}

  list(year?: number, month?: number) {
    if (year && month) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 1));
      return this.prisma.holiday.findMany({ where: { date: { gte: start, lt: end } }, orderBy: { date: 'asc' } });
    }
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  async isHoliday(date: string): Promise<boolean> {
    const d = parseDateOnly(date);
    if (d.getUTCDay() === 0) return true; // Sunday
    const row = await this.prisma.holiday.findUnique({ where: { date: d } });
    return !!row;
  }

  create(input: { date: string; name: string; notes?: string | null; createdById?: string | null }) {
    return this.prisma.holiday.upsert({
      where: { date: parseDateOnly(input.date) },
      create: {
        date: parseDateOnly(input.date),
        name: input.name,
        type: 'custom',
        notes: input.notes ?? null,
        createdById: input.createdById ?? null,
      },
      update: { name: input.name, notes: input.notes ?? null },
    });
  }

  async remove(id: string) {
    const row = await this.prisma.holiday.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Holiday not found');
    await this.prisma.holiday.delete({ where: { id } });
    return { ok: true };
  }
}

/** Count holidays (Sundays + custom rows) in a given [start,end) UTC range. */
export function countHolidaysInRange(customDates: Date[], year: number, month: number): { sundays: number; custom: number; totalHolidayDates: Set<string> } {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const set = new Set<string>();
  let sundays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    if (dt.getUTCDay() === 0) { sundays++; set.add(dt.toISOString().slice(0, 10)); }
  }
  let custom = 0;
  for (const c of customDates) {
    const key = c.toISOString().slice(0, 10);
    if (!set.has(key)) { custom++; set.add(key); }
  }
  return { sundays, custom, totalHolidayDates: set };
}
