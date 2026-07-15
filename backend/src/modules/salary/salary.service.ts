import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseDateOnly } from '../ledger/ledger.service';

/**
 * Round to nearest multiple of 10. Values ending in exact 5 (no decimal)
 * are preserved.
 */
export function roundToNearest10(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value - Math.round(value)) < 1e-9) {
    const intVal = Math.round(value);
    if (intVal % 10 === 5) return intVal;
  }
  return Math.round(value / 10) * 10;
}

@Injectable()
export class SalaryService {
  constructor(private prisma: PrismaService) {}

  async monthlySummary(year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    // Count Sundays in month.
    let sundays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === 0) sundays++;
    }

    const [employees, attendance, advances, customHolidays] = await Promise.all([
      this.prisma.employee.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      this.prisma.attendance.findMany({ where: { date: { gte: start, lt: end } } }),
      this.prisma.salaryAdvance.findMany({ where: { date: { gte: start, lt: end } } }),
      this.prisma.holiday.findMany({ where: { date: { gte: start, lt: end } } }),
    ]);

    // Custom holidays that are NOT Sundays (Sundays already counted).
    const customNonSunday = customHolidays.filter((h) => h.date.getUTCDay() !== 0).length;
    const holidays = sundays + customNonSunday;

    return employees.map((emp) => {
      const empAtt = attendance.filter((a) => a.employeeId === emp.id);
      const counts = {
        present: empAtt.filter((a) => a.status === AttendanceStatus.present).length,
        half_day: empAtt.filter((a) => a.status === AttendanceStatus.half_day).length,
        absent: empAtt.filter((a) => a.status === AttendanceStatus.absent).length,
        leave: empAtt.filter((a) => a.status === AttendanceStatus.leave).length,
      };

      let attendedDays: number;
      let unmarked: number;
      if (emp.alwaysPresent) {
        // Auto-credit every day except explicitly marked absent/leave.
        attendedDays = daysInMonth - counts.absent - counts.leave;
        unmarked = 0;
      } else {
        // Normal employees: holidays don't reduce pay (credited as present).
        attendedDays = counts.present + counts.half_day * 0.5 + holidays;
        const marked = counts.present + counts.half_day + counts.absent + counts.leave;
        unmarked = Math.max(0, daysInMonth - marked - holidays);
      }

      const monthly = Number(emp.monthlySalary);
      const grossRaw = daysInMonth > 0 ? (monthly / daysInMonth) * attendedDays : 0;
      const gross = roundToNearest10(grossRaw);
      const empAdvances = advances.filter((a) => a.employeeId === emp.id).reduce((s, a) => s + Number(a.amount), 0);
      const netPayable = gross - empAdvances;
      return {
        employee: {
          id: emp.id, name: emp.name, designation: emp.designation,
          monthlySalary: monthly.toString(), alwaysPresent: emp.alwaysPresent,
        },
        daysInMonth,
        holidays,
        sundays,
        customHolidays: customNonSunday,
        counts,
        unmarked,
        attendedDays,
        grossRaw: Number(grossRaw.toFixed(2)),
        gross,
        advances: empAdvances,
        netPayable,
      };
    });
  }

  createAdvance(input: { employeeId: string; date: string; amount: number; notes?: string | null; createdById?: string | null }) {
    return this.prisma.salaryAdvance.create({
      data: {
        employeeId: input.employeeId,
        date: parseDateOnly(input.date),
        amount: new Prisma.Decimal(input.amount),
        notes: input.notes ?? null,
        createdById: input.createdById ?? null,
      },
    });
  }

  listAdvances(filters: { employeeId?: string; year?: number; month?: number }) {
    const where: Prisma.SalaryAdvanceWhereInput = {};
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.year && filters.month) {
      const start = new Date(Date.UTC(filters.year, filters.month - 1, 1));
      const end = new Date(Date.UTC(filters.year, filters.month, 1));
      where.date = { gte: start, lt: end };
    }
    return this.prisma.salaryAdvance.findMany({ where, orderBy: { date: 'desc' }, include: { employee: { select: { id: true, name: true } } } });
  }

  async removeAdvance(id: string) {
    const row = await this.prisma.salaryAdvance.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Advance not found');
    await this.prisma.salaryAdvance.delete({ where: { id } });
    return { ok: true };
  }
}
