import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentKind, PaymentMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnly, LedgerService } from '../ledger/ledger.service';

export interface RecordPaymentInput {
  patientId: string;
  kind: PaymentKind;
  mode: PaymentMode;
  amount: number;
  notes?: string | null;
  date?: string | null;
  createdById?: string | null;
}

/**
 * Append-only payment log.
 *
 * NOTE: Patient.advanceCash/advanceUpi/balanceCash/balanceUpi remain the source of truth
 * for ledger math (unchanged). Recording a payment here ALSO mirrors the amount into
 * the matching Patient bucket so the existing Today Register / ledger logic keeps working.
 */
@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  async record(input: RecordPaymentInput) {
    const patient = await this.prisma.patient.findUnique({ where: { id: input.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const date = input.date ? dateOnly(new Date(input.date)) : dateOnly();
    const amount = new Prisma.Decimal(input.amount);

    // Mirror into Patient buckets so legacy logic (ledger.recompute) stays correct.
    const field =
      input.kind === 'advance'
        ? input.mode === 'cash' ? 'advanceCash' : 'advanceUpi'
        : input.mode === 'cash' ? 'balanceCash' : 'balanceUpi';
    const paidOnField = input.kind === 'advance' ? 'advancePaidOn' : 'balancePaidOn';

    const current = new Prisma.Decimal((patient as any)[field] ?? 0);
    const newValue = current.plus(amount);
    // const newBalance = new Prisma.Decimal(patient.net)
    //   .minus(input.kind === 'advance' ? newValue : patient.advanceCash)
    //   .minus(input.kind === 'advance' ? patient.advanceUpi : (input.mode === 'upi' && input.kind === 'advance' ? newValue : patient.advanceUpi))
    //   .minus(input.kind === 'balance' && input.mode === 'cash' ? newValue : patient.balanceCash)
    //   .minus(input.kind === 'balance' && input.mode === 'upi' ? newValue : patient.balanceUpi);

    const __tDb = Date.now();
    const [, updated] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          patientId: input.patientId,
          date,
          kind: input.kind,
          mode: input.mode,
          amount,
          notes: input.notes ?? null,
          createdById: input.createdById ?? null,
        },
      }),
      this.prisma.patient.update({
        where: { id: input.patientId },
        data: {
          [field]: newValue,
          [paidOnField]: new Date(),
          balance: this.recomputePatientBalance(patient, field, newValue),
        } as any,
      }),
    ]);
    console.log(`[perf] payments.record DB ${Date.now() - __tDb}ms`);

    void this.ledger
      .recompute(patient.entryDate)
      .catch((err) => console.error('[payments.record] background recompute failed', err));
    return { patient: updated };
  }

  /** Recompute Patient.balance = net - sum(advance+balance buckets), with one bucket overridden. */
  private recomputePatientBalance(
    patient: { net: Prisma.Decimal; advanceCash: Prisma.Decimal; advanceUpi: Prisma.Decimal; balanceCash: Prisma.Decimal; balanceUpi: Prisma.Decimal },
    overrideField: 'advanceCash' | 'advanceUpi' | 'balanceCash' | 'balanceUpi',
    overrideValue: Prisma.Decimal,
  ) {
    const buckets = {
      advanceCash: new Prisma.Decimal(patient.advanceCash),
      advanceUpi: new Prisma.Decimal(patient.advanceUpi),
      balanceCash: new Prisma.Decimal(patient.balanceCash),
      balanceUpi: new Prisma.Decimal(patient.balanceUpi),
    };
    buckets[overrideField] = overrideValue;
    return new Prisma.Decimal(patient.net)
      .minus(buckets.advanceCash)
      .minus(buckets.advanceUpi)
      .minus(buckets.balanceCash)
      .minus(buckets.balanceUpi);
  }

  listByPatient(patientId: string) {
    return this.prisma.payment.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
    });
  }

  listByDate(date?: string) {
    const d = date ? dateOnly(new Date(date)) : dateOnly();
    return this.prisma.payment.findMany({
      where: { date: d },
      orderBy: { createdAt: 'asc' },
      include: { patient: { select: { id: true, name: true, dailySerial: true, mobile: true } } },
    });
  }

  async remove(id: string) {
    const pay = await this.prisma.payment.findUnique({ where: { id } });
    if (!pay) throw new NotFoundException();
    const patient = await this.prisma.patient.findUnique({ where: { id: pay.patientId } });
    await this.prisma.payment.delete({ where: { id } });
    if (patient) {
      const field =
        pay.kind === 'advance'
          ? pay.mode === 'cash' ? 'advanceCash' : 'advanceUpi'
          : pay.mode === 'cash' ? 'balanceCash' : 'balanceUpi';
      const newValue = new Prisma.Decimal((patient as any)[field]).minus(pay.amount);
      await this.prisma.patient.update({
        where: { id: patient.id },
        data: {
          [field]: newValue,
          balance: this.recomputePatientBalance(patient, field as any, newValue),
        } as any,
      });
      await this.ledger.recompute(patient.entryDate);
    }
    return { ok: true };
  }
}
