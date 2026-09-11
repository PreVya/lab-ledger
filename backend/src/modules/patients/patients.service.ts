import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Sex, PaymentKind, PaymentMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertLedgerDate, dateOnly, LedgerService } from '../ledger/ledger.service';
import { PaymentsService } from '../payments/payments.service';
import { financialYearFor } from './fy';
import { getRegisterStartNumber } from '../../config/ledger.config';

export type AgeUnit = 'days' | 'months' | 'years';

/** One explicit payment transaction supplied by the Payment Transactions UI. */
export interface PatientPaymentInput {
  kind: PaymentKind;
  mode: PaymentMode;
  amount: number;
  /** REQUIRED — never defaulted. */
  date: string;
  notes?: string | null;
}

export interface UpsertPatientInput {
  name: string;
  mobile: string;
  age?: number;
  ageValue?: number;
  ageUnit?: AgeUnit;
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
  createdById?: string;
  entryDate?: string | null;
  /** Manual tracking flags — no automation attached. */
  whatsappReportRequired?: boolean;
  outsourcedReportReady?: boolean;
  /**
   * Explicit payment transactions (create only). When provided, Payment rows are
   * created ONLY from this array; when absent, the legacy advance/balance bucket
   * fields are used. The two sources are never combined in one request.
   */
  payments?: PatientPaymentInput[];
}

type Bucket = { kind: PaymentKind; mode: PaymentMode; field: 'advanceCash' | 'advanceUpi' | 'balanceCash' | 'balanceUpi' };
const BUCKETS: Bucket[] = [
  { kind: 'advance', mode: 'cash', field: 'advanceCash' },
  { kind: 'advance', mode: 'upi',  field: 'advanceUpi'  },
  { kind: 'balance', mode: 'cash', field: 'balanceCash' },
  { kind: 'balance', mode: 'upi',  field: 'balanceUpi'  },
];

/** Normalize incoming age fields into { ageValue, ageUnit, legacyAge } */
function normalizeAge(input: UpsertPatientInput): { ageValue: number; ageUnit: AgeUnit; legacyAge: number } {
  const ageValue = input.ageValue ?? input.age ?? 0;
  const ageUnit = input.ageUnit ?? 'years';
  const legacyAge = ageUnit === 'years' ? ageValue : 0;
  return { ageValue, ageUnit, legacyAge };
}

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private payments: PaymentsService,
  ) {}

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
   * Payment dates are NEVER assumed. The user must select them explicitly whenever
   * money was received; we only validate + normalize here.
   */
  private resolvePaidOn(s: string | null | undefined): Date | null {
    if (!s) return null;
    return assertLedgerDate(dateOnly(new Date(s)));
  }

  private assertPaidDates(
    pay: { advanceCash: number; advanceUpi: number; balanceCash: number; balanceUpi: number },
    advancePaidOn: Date | null,
    balancePaidOn: Date | null,
  ) {
    if (pay.advanceCash + pay.advanceUpi > 0 && !advancePaidOn) {
      throw new BadRequestException('Please select Advance Paid On date.');
    }
    if (pay.balanceCash + pay.balanceUpi > 0 && !balancePaidOn) {
      throw new BadRequestException('Please select Balance Paid On date.');
    }
  }

  async assignNumbersAndCreate(entryDate: Date, data: Omit<Prisma.PatientUncheckedCreateInput, 'financialYear' | 'registerNumber' | 'dailySerial' | 'entryDate'>) {
    assertLedgerDate(entryDate);
    const fy = financialYearFor(entryDate);
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const [lastFy, lastDay] = await Promise.all([
            tx.patient.findFirst({ where: { financialYear: fy }, orderBy: { registerNumber: 'desc' }, select: { registerNumber: true } }),
            tx.patient.findFirst({ where: { entryDate }, orderBy: { dailySerial: 'desc' }, select: { dailySerial: true } }),
          ]);
          const registerNumber = lastFy
            ? lastFy.registerNumber + 1
            : getRegisterStartNumber(fy);
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
    if (!input.createdById) throw new BadRequestException('createdById missing — login required');
    // entryDate is NEVER inferred from the system clock — the caller must send it explicitly.
    if (!input.entryDate) throw new BadRequestException('Patient entry date is required.');
    const entryDay = assertLedgerDate(dateOnly(new Date(input.entryDate)));
    await this.ledger.ensureDay(entryDay);

    const tests = await this.prisma.testCatalog.findMany({ where: { id: { in: input.testIds } } });
    if (tests.length !== input.testIds.length) throw new BadRequestException('Invalid test selection');
    const pay = this.computePayment(tests.map((t) => Number(t.rate)), input);
    const { ageValue, ageUnit, legacyAge } = normalizeAge(input);

    const advanceDate = this.resolvePaidOn(input.advancePaidOn);
    const balanceDate = this.resolvePaidOn(input.balancePaidOn);
    this.assertPaidDates(pay, advanceDate, balanceDate);

    const patient = await this.assignNumbersAndCreate(entryDay, {
      name: input.name,
      mobile: input.mobile,
      age: legacyAge,
      ageValue,
      ageUnit,
      sex: input.sex,
      referredDoctor: input.referredDoctor ?? null,
      notes: input.notes ?? null,
      createdById: input.createdById,
      total: new Prisma.Decimal(pay.total),
      discount: new Prisma.Decimal(pay.discount),
      net: new Prisma.Decimal(pay.net),
      advanceCash: new Prisma.Decimal(pay.advanceCash),
      advanceUpi: new Prisma.Decimal(pay.advanceUpi),
      advancePaidOn: advanceDate,
      balance: new Prisma.Decimal(pay.balance),
      balanceCash: new Prisma.Decimal(pay.balanceCash),
      balanceUpi: new Prisma.Decimal(pay.balanceUpi),
      balancePaidOn: balanceDate,
      tests: { create: tests.map((t) => ({ testId: t.id, rateAtEntry: t.rate })) },
    } as any);

    // Payment rows: EITHER the explicit transactions[] from the Payment Transactions
    // UI, OR the legacy advance/balance bucket fields — never both.
    const paymentRows: Prisma.PaymentCreateManyInput[] = [];
    if (input.payments?.length) {
      for (const p of input.payments) {
        const amount = new Prisma.Decimal(p.amount);
        if (amount.lessThanOrEqualTo(0)) throw new BadRequestException('Payment amount must be greater than 0.');
        paymentRows.push({
          patientId: patient.id,
          date: this.resolvePaidOn(p.date) as Date,
          kind: p.kind,
          mode: p.mode,
          amount,
          notes: p.notes ?? null,
          createdById: input.createdById ?? null,
        });
      }
      if (paymentRows.length) await this.prisma.payment.createMany({ data: paymentRows });
      // Rebuild the bucket mirrors purely from the rows just created.
      await this.payments.resyncPatient(patient.id);
    } else {
      for (const b of BUCKETS) {
        const amount = (pay as any)[b.field] as number;
        if (amount > 0) {
          paymentRows.push({
            patientId: patient.id,
            date: (b.kind === 'advance' ? advanceDate : balanceDate) as Date,
            kind: b.kind,
            mode: b.mode,
            amount: new Prisma.Decimal(amount),
            createdById: input.createdById ?? null,
          });
        }
      }
      if (paymentRows.length) await this.prisma.payment.createMany({ data: paymentRows });
    }

    const distinctDates = new Set<string>([entryDay.toISOString().slice(0, 10)]);
    paymentRows.forEach((r) => distinctDates.add((r.date as Date).toISOString().slice(0, 10)));
    for (const iso of distinctDates) {
      void this.ledger.recompute(new Date(iso)).catch((err) => console.error('[patients.create] bg recompute failed', err));
    }
    return patient;
  }

  async update(id: string, input: UpsertPatientInput) {
    const existing = await this.prisma.patient.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    const tests = await this.prisma.testCatalog.findMany({ where: { id: { in: input.testIds } } });
    const pay = this.computePayment(tests.map((t) => Number(t.rate)), input);
    const { ageValue, ageUnit, legacyAge } = normalizeAge(input);

    // entryDate is NEVER read, recomputed, or modified here — it only changes
    // through the explicit patient edit flow. Patient edit touches demographics,
    // tests and discount ONLY; money is edited through the payments endpoints.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.patientTest.deleteMany({ where: { patientId: id } });
      return tx.patient.update({
        where: { id },
        data: {
          name: input.name,
          mobile: input.mobile,
          age: legacyAge,
          ageValue,
          ageUnit,
          sex: input.sex,
          referredDoctor: input.referredDoctor ?? null,
          notes: input.notes ?? null,
          total: new Prisma.Decimal(pay.total),
          discount: new Prisma.Decimal(pay.discount),
          net: new Prisma.Decimal(pay.net),
          tests: { create: tests.map((t) => ({ testId: t.id, rateAtEntry: t.rate })) },
        } as any,
        include: { tests: { include: { test: true } } },
      });
    });

    // Rebuild the money summary (advance/balance buckets, paidOn dates, balance)
    // purely from the existing Payment rows — no delta / correction rows.
    const resynced = await this.payments.resyncPatient(id);
    void this.ledger
      .recompute(dateOnly(existing.entryDate))
      .catch((err) => console.error('[patients.update] bg recompute failed', err));
    return { ...(resynced ?? updated), tests: updated.tests };
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
