import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Sex } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnly, LedgerService } from '../ledger/ledger.service';
import { financialYearFor } from './fy';

export interface UpsertPatientInput {
  name: string;
  mobile: string;
  age: number;
  sex: Sex;
  referredDoctor?: string | null;
  notes?: string | null;
  testIds: string[];
  discount?: number;
  advanceCash?: number;
  advanceUpi?: number;
  advancePaidOn?: string | null;
  balanceCash?: number;
  balanceUpi?: number;
  balancePaidOn?: string | null;
}

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  private computePayment(testRates: number[], input: UpsertPatientInput) {
    const total = testRates.reduce((s, r) => s + Number(r), 0);
    const discount = Number(input.discount ?? 0);
    const net = Math.max(0, total - discount);
    const advanceCash = Number(input.advanceCash ?? 0);
    const advanceUpi = Number(input.advanceUpi ?? 0);
    const balanceCash = Number(input.balanceCash ?? 0);
    const balanceUpi = Number(input.balanceUpi ?? 0);
    const balance = net - advanceCash - advanceUpi - balanceCash - balanceUpi;
    return { total, discount, net, advanceCash, advanceUpi, balanceCash, balanceUpi, balance };
  }

  /**
   * Reusable: assign next register number for a given entry date.
   * Safe for concurrent inserts — unique([financialYear, registerNumber]) catches
   * duplicates; we retry a few times.
   */
  async assignNumbersAndCreate(entryDate: Date, data: Omit<Prisma.PatientCreateInput, 'financialYear' | 'registerNumber' | 'dailySerial' | 'entryDate'>) {
    const fy = financialYearFor(entryDate);
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const [lastFy, lastDay] = await Promise.all([
            tx.patient.findFirst({
              where: { financialYear: fy },
              orderBy: { registerNumber: 'desc' },
              select: { registerNumber: true },
            }),
            tx.patient.findFirst({
              where: { entryDate },
              orderBy: { dailySerial: 'desc' },
              select: { dailySerial: true },
            }),
          ]);
          const registerNumber = (lastFy?.registerNumber ?? 0) + 1;
          const dailySerial = (lastDay?.dailySerial ?? 0) + 1;
          return tx.patient.create({
            data: { ...data, entryDate, financialYear: fy, registerNumber, dailySerial },
            include: { tests: { include: { test: true } } },
          });
        });
      } catch (e) {
        lastErr = e;
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          // unique collision (concurrent insert) — retry
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  async create(input: UpsertPatientInput) {
    if (!input.testIds?.length) throw new BadRequestException('At least one test required');
    const today = dateOnly();
    await this.ledger.ensureDay(today);

    const tests = await this.prisma.testCatalog.findMany({ where: { id: { in: input.testIds } } });
    if (tests.length !== input.testIds.length) throw new BadRequestException('Invalid test selection');
    const pay = this.computePayment(tests.map((t) => Number(t.rate)), input);

    const __tTx = Date.now();
    const patient = await this.assignNumbersAndCreate(today, {
      name: input.name,
      mobile: input.mobile,
      age: input.age,
      sex: input.sex,
      referredDoctor: input.referredDoctor ?? null,
      notes: input.notes ?? null,
      total: new Prisma.Decimal(pay.total),
      discount: new Prisma.Decimal(pay.discount),
      net: new Prisma.Decimal(pay.net),
      advanceCash: new Prisma.Decimal(pay.advanceCash),
      advanceUpi: new Prisma.Decimal(pay.advanceUpi),
      advancePaidOn: input.advancePaidOn ? new Date(input.advancePaidOn) : null,
      balance: new Prisma.Decimal(pay.balance),
      balanceCash: new Prisma.Decimal(pay.balanceCash),
      balanceUpi: new Prisma.Decimal(pay.balanceUpi),
      balancePaidOn: input.balancePaidOn ? new Date(input.balancePaidOn) : null,
      tests: { create: tests.map((t) => ({ testId: t.id, rateAtEntry: t.rate })) },
    });
    console.log(`[perf] patients.create TX ${Date.now() - __tTx}ms`);

    void this.ledger.recompute(today).catch((err) => console.error('[patients.create] bg recompute failed', err));
    return patient;
  }

  async update(id: string, input: UpsertPatientInput) {
    const existing = await this.prisma.patient.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    const tests = await this.prisma.testCatalog.findMany({ where: { id: { in: input.testIds } } });
    const pay = this.computePayment(tests.map((t) => Number(t.rate)), input);

    const updated = await this.prisma.$transaction(async (tx) => {
      const __tTx = Date.now();
      await tx.patientTest.deleteMany({ where: { patientId: id } });
      const u = await tx.patient.update({
        where: { id },
        data: {
          name: input.name,
          mobile: input.mobile,
          age: input.age,
          sex: input.sex,
          referredDoctor: input.referredDoctor ?? null,
          notes: input.notes ?? null,
          total: new Prisma.Decimal(pay.total),
          discount: new Prisma.Decimal(pay.discount),
          net: new Prisma.Decimal(pay.net),
          advanceCash: new Prisma.Decimal(pay.advanceCash),
          advanceUpi: new Prisma.Decimal(pay.advanceUpi),
          advancePaidOn: input.advancePaidOn ? new Date(input.advancePaidOn) : null,
          balance: new Prisma.Decimal(pay.balance),
          balanceCash: new Prisma.Decimal(pay.balanceCash),
          balanceUpi: new Prisma.Decimal(pay.balanceUpi),
          balancePaidOn: input.balancePaidOn ? new Date(input.balancePaidOn) : null,
          tests: { create: tests.map((t) => ({ testId: t.id, rateAtEntry: t.rate })) },
        },
        include: { tests: { include: { test: true } } },
      });
      console.log(`[perf] patients.update TX ${Date.now() - __tTx}ms`);
      return u;
    });

    void this.ledger.recompute(existing.entryDate).catch((err) => console.error('[patients.update] bg recompute failed', err));
    return updated;
  }

  get(id: string) {
    return this.prisma.patient.findUnique({
      where: { id },
      include: { tests: { include: { test: true } } },
    });
  }

  search(q: string, fy?: string) {
    const trimmed = q.trim();
    const numeric = /^\d+$/.test(trimmed);
    const where: Prisma.PatientWhereInput = {
      OR: [
        ...(trimmed ? [{ name: { contains: trimmed, mode: 'insensitive' as const } }] : []),
        ...(trimmed ? [{ mobile: { contains: trimmed } }] : []),
        ...(numeric ? [{ registerNumber: parseInt(trimmed, 10) }] : []),
        ...(numeric ? [{ dailySerial: parseInt(trimmed, 10) }] : []),
      ],
    };
    if (fy) (where as any).financialYear = fy;
    return this.prisma.patient.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { registerNumber: 'desc' }],
      take: 50,
      include: { tests: { include: { test: true } } },
    });
  }
}
