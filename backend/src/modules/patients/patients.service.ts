import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Sex, PaymentKind, PaymentMode } from '@prisma/client';
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

type Bucket = { kind: PaymentKind; mode: PaymentMode; field: 'advanceCash' | 'advanceUpi' | 'balanceCash' | 'balanceUpi' };
const BUCKETS: Bucket[] = [
  { kind: 'advance', mode: 'cash', field: 'advanceCash' },
  { kind: 'advance', mode: 'upi',  field: 'advanceUpi'  },
  { kind: 'balance', mode: 'cash', field: 'balanceCash' },
  { kind: 'balance', mode: 'upi',  field: 'balanceUpi'  },
];

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
    // Formula preserved: balance = net - advanceCash - advanceUpi - balanceCash - balanceUpi
    const balance = net - advanceCash - advanceUpi - balanceCash - balanceUpi;
    return { total, discount, net, advanceCash, advanceUpi, balanceCash, balanceUpi, balance };
  }

  /** IST date-only for an optional ISO/YYYY-MM-DD string; falls back to provided default. */
  private resolveDate(s: string | null | undefined, fallback: Date): Date {
    return s ? dateOnly(new Date(s)) : fallback;
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
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
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

    const advanceDate = this.resolveDate(input.advancePaidOn, today);
    const balanceDate = this.resolveDate(input.balancePaidOn, today);

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
      advancePaidOn: input.advancePaidOn ? new Date(input.advancePaidOn) : (pay.advanceCash + pay.advanceUpi > 0 ? today : null),
      balance: new Prisma.Decimal(pay.balance),
      balanceCash: new Prisma.Decimal(pay.balanceCash),
      balanceUpi: new Prisma.Decimal(pay.balanceUpi),
      balancePaidOn: input.balancePaidOn ? new Date(input.balancePaidOn) : (pay.balanceCash + pay.balanceUpi > 0 ? today : null),
      tests: { create: tests.map((t) => ({ testId: t.id, rateAtEntry: t.rate })) },
    });
    console.log(`[perf] patients.create TX ${Date.now() - __tTx}ms`);

    // Mirror each non-zero bucket into the Payment audit log so date-wise
    // ledger collection is consistent (sums Payment.date, not Patient.entryDate).
    const paymentRows: Prisma.PaymentCreateManyInput[] = [];
    for (const b of BUCKETS) {
      const amount = (pay as any)[b.field] as number;
      if (amount > 0) {
        paymentRows.push({
          patientId: patient.id,
          date: b.kind === 'advance' ? advanceDate : balanceDate,
          kind: b.kind,
          mode: b.mode,
          amount: new Prisma.Decimal(amount),
        });
      }
    }
    if (paymentRows.length) {
      await this.prisma.payment.createMany({ data: paymentRows });
    }

    // Recompute every distinct payment date affected (today + any payment dates).
    const distinctDates = new Set<string>([today.toISOString().slice(0, 10)]);
    paymentRows.forEach((r) => distinctDates.add((r.date as Date).toISOString().slice(0, 10)));
    for (const iso of distinctDates) {
      void this.ledger
        .recompute(new Date(iso))
        .catch((err) => console.error('[patients.create] bg recompute failed', err));
    }
    return patient;
  }

  async update(id: string, input: UpsertPatientInput) {
    const existing = await this.prisma.patient.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    const tests = await this.prisma.testCatalog.findMany({ where: { id: { in: input.testIds } } });
    const pay = this.computePayment(tests.map((t) => Number(t.rate)), input);

    const today = dateOnly();
    const advanceDate = this.resolveDate(input.advancePaidOn, today);
    const balanceDate = this.resolveDate(input.balancePaidOn, today);

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
          advancePaidOn: input.advancePaidOn ? new Date(input.advancePaidOn) : existing.advancePaidOn,
          balance: new Prisma.Decimal(pay.balance),
          balanceCash: new Prisma.Decimal(pay.balanceCash),
          balanceUpi: new Prisma.Decimal(pay.balanceUpi),
          balancePaidOn: input.balancePaidOn ? new Date(input.balancePaidOn) : existing.balancePaidOn,
          tests: { create: tests.map((t) => ({ testId: t.id, rateAtEntry: t.rate })) },
        },
        include: { tests: { include: { test: true } } },
      });
      console.log(`[perf] patients.update TX ${Date.now() - __tTx}ms`);
      return u;
    });

    // Reconcile Payment audit log with new bucket values. For each (kind,mode)
    // compute delta vs existing Payment sum and write a single delta row.
    // This preserves the full audit history (including rows from payments.record).
    const affectedDates = new Set<string>([existing.entryDate.toISOString().slice(0, 10)]);
    const existingByBucket = await this.prisma.payment.groupBy({
      by: ['kind', 'mode'],
      where: { patientId: id },
      _sum: { amount: true },
    });
    const lookup = new Map<string, Prisma.Decimal>();
    for (const r of existingByBucket) {
      lookup.set(`${r.kind}:${r.mode}`, r._sum.amount ?? new Prisma.Decimal(0));
    }

    const deltaRows: Prisma.PaymentCreateManyInput[] = [];
    for (const b of BUCKETS) {
      const target = new Prisma.Decimal((pay as any)[b.field] as number);
      const current = lookup.get(`${b.kind}:${b.mode}`) ?? new Prisma.Decimal(0);
      const delta = target.minus(current);
      if (!delta.isZero()) {
        const d = b.kind === 'advance' ? advanceDate : balanceDate;
        deltaRows.push({
          patientId: id,
          date: d,
          kind: b.kind,
          mode: b.mode,
          amount: delta, // may be negative; reflects audit-log correction
          notes: '[form-sync delta]',
        });
        affectedDates.add(d.toISOString().slice(0, 10));
      }
    }
    if (deltaRows.length) {
      await this.prisma.payment.createMany({ data: deltaRows });
    }

    for (const iso of affectedDates) {
      void this.ledger
        .recompute(new Date(iso))
        .catch((err) => console.error('[patients.update] bg recompute failed', err));
    }
    return updated;
  }

  get(id: string) {
    return this.prisma.patient.findUnique({
      where: { id },
      include: { tests: { include: { test: true } }, payments: { orderBy: { createdAt: 'asc' } } },
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
