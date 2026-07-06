import { Injectable } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseDateOnly } from '../ledger/ledger.service';

export interface BulkAttendanceEntry {
  employeeId: string;
  status: AttendanceStatus;
  notes?: string | null;
}

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async listForDate(date: string) {
    const day = parseDateOnly(date);
    const [employees, records] = await Promise.all([
      this.prisma.employee.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      this.prisma.attendance.findMany({ where: { date: day } }),
    ]);
    const byEmp = new Map(records.map((r) => [r.employeeId, r]));
    return employees.map((e) => ({
      employee: { id: e.id, name: e.name, designation: e.designation, monthlySalary: e.monthlySalary.toString() },
      attendance: byEmp.get(e.id) ?? null,
    }));
  }

  async bulkUpsert(date: string, entries: BulkAttendanceEntry[], markedById?: string | null) {
    const day = parseDateOnly(date);
    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.attendance.upsert({
          where: { employeeId_date: { employeeId: e.employeeId, date: day } },
          create: { employeeId: e.employeeId, date: day, status: e.status, notes: e.notes ?? null, markedById: markedById ?? null },
          update: { status: e.status, notes: e.notes ?? null, markedById: markedById ?? null },
        }),
      ),
    );
    return { ok: true, count: entries.length };
  }

  async monthMatrix(employeeId: string, year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const rows = await this.prisma.attendance.findMany({
      where: { employeeId, date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), status: r.status, notes: r.notes }));
  }
}
