import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma, Sex } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseDateOnly } from '../ledger/ledger.service';

export interface UpsertAppointmentInput {
  name: string;
  mobile: string;
  ageValue?: number;
  ageUnit?: 'days' | 'months' | 'years';
  sex: Sex;
  referredDoctor?: string | null;
  procedure: string;
  appointmentDate: string;
  appointmentTime?: string | null;
  notes?: string | null;
  status?: AppointmentStatus;
  createdById?: string | null;
}

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  create(input: UpsertAppointmentInput) {
    return this.prisma.appointment.create({
      data: {
        name: input.name,
        mobile: input.mobile,
        ageValue: input.ageValue ?? 0,
        ageUnit: input.ageUnit ?? 'years',
        sex: input.sex,
        referredDoctor: input.referredDoctor ?? null,
        procedure: input.procedure,
        appointmentDate: parseDateOnly(input.appointmentDate),
        appointmentTime: input.appointmentTime ?? null,
        notes: input.notes ?? null,
        status: input.status ?? AppointmentStatus.scheduled,
        createdById: input.createdById ?? null,
      },
    });
  }

  async update(id: string, input: Partial<UpsertAppointmentInput> & { status?: AppointmentStatus }) {
    const existing = await this.prisma.appointment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Appointment not found');
    const data: Prisma.AppointmentUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.mobile !== undefined) data.mobile = input.mobile;
    if (input.ageValue !== undefined) data.ageValue = input.ageValue;
    if (input.ageUnit !== undefined) data.ageUnit = input.ageUnit;
    if (input.sex !== undefined) data.sex = input.sex;
    if (input.referredDoctor !== undefined) data.referredDoctor = input.referredDoctor;
    if (input.procedure !== undefined) data.procedure = input.procedure;
    if (input.appointmentDate !== undefined) data.appointmentDate = parseDateOnly(input.appointmentDate);
    if (input.appointmentTime !== undefined) data.appointmentTime = input.appointmentTime;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.status !== undefined) data.status = input.status;
    return this.prisma.appointment.update({ where: { id }, data });
  }

  list(filters: { date?: string; status?: AppointmentStatus; q?: string }) {
    const where: Prisma.AppointmentWhereInput = {};
    if (filters.date) where.appointmentDate = parseDateOnly(filters.date);
    if (filters.status) where.status = filters.status;
    if (filters.q) {
      const q = filters.q.trim();
      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { mobile: { contains: q } },
          { procedure: { contains: q, mode: 'insensitive' } },
          { referredDoctor: { contains: q, mode: 'insensitive' } },
        ];
      }
    }
    return this.prisma.appointment.findMany({
      where,
      orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'asc' }, { createdAt: 'asc' }],
      include: { linkedPatient: { select: { id: true, registerNumber: true, financialYear: true, dailySerial: true, entryDate: true, name: true } } },
    });
  }

  get(id: string) {
    return this.prisma.appointment.findUnique({
      where: { id },
      include: { linkedPatient: { select: { id: true, registerNumber: true, financialYear: true, dailySerial: true, entryDate: true, name: true } } },
    });
  }

  async remove(id: string) {
    await this.prisma.appointment.delete({ where: { id } });
    return { ok: true };
  }

  async linkPatient(id: string, patientId: string) {
    const existing = await this.prisma.appointment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Appointment not found');
    if (existing.linkedPatientId) throw new BadRequestException('Appointment already linked to a patient.');
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Patient not found');
    return this.prisma.appointment.update({
      where: { id },
      data: { linkedPatientId: patientId, status: AppointmentStatus.sample_collected },
    });
  }
}
