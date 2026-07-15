import { Injectable } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseDateOnly } from '../ledger/ledger.service';
import { HolidaysService } from '../holidays/holidays.service';

export interface BulkAttendanceEntry {
  employeeId: string;
  status: AttendanceStatus;
  notes?: string | null;
}

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService, private holidays: HolidaysService) {}

  async listForDate(date: string) {
    const day = parseDateOnly(date);
    const isSunday = day.getUTCDay() === 0;
    const custom = await this.prisma.holiday.findUnique({ where: { date: day } });
    const isHoliday = isSunday || !!custom;

    const [employees, records] = await Promise.all([
      this.prisma.employee.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      this.prisma.attendance.findMany({ where: { date: day } }),
    ]);
    const byEmp = new Map(records.map((r) => [r.employeeId, r]));
    return {
      date: day.toISOString().slice(0, 10),
      isSunday,
      isHoliday,
      holiday: custom ? { id: custom.id, name: custom.name, type: custom.type } : (isSunday ? { id: null, name: 'Sunday', type: 'sunday' } : null),
      rows: employees.map((e) => ({
        employee: {
          id: e.id, name: e.name, designation: e.designation,
          monthlySalary: e.monthlySalary.toString(), alwaysPresent: e.alwaysPresent,
        },
        attendance: byEmp.get(e.id) ?? null,
        // Effective status for display (not persisted): alwaysPresent employees
        // default to "present" on any working day; everyone defaults to "present"
        // on holidays for salary purposes (visualized in UI).
        effectiveStatus: byEmp.get(e.id)?.status ?? (e.alwaysPresent || isHoliday ? 'present' : null),
      })),
    };
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
