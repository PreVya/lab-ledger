import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentKind, PaymentMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertLedgerDate, dateOnly, LedgerService } from '../ledger/ledger.service';

export interface RecordPaymentInput {
  patientId: string;
  kind: PaymentKind;
  mode: PaymentMode;
  amount: number;
  notes?: string | null;
  /** REQUIRED — the actual date the money was received. Never defaulted. */
  date?: string | null;
  createdById?: string | null;
}

export interface UpdatePaymentInput {
  kind?: PaymentKind;
  mode?: PaymentMode;
  amount?: number;
  notes?: string | null;
  date?: string | null;
}

const ZERO = () => new Prisma.Decimal(0);
export const FORM_SYNC_DELTA_NOTE = '[form-sync delta]';

/**
 * Payment is the CANONICAL source of truth for money received and kept by the lab.
 *
 * Patient.advanceCash / advanceUpi / balanceCash / balanceUpi / advancePaidOn /
 * balancePaidOn are derived summary mirrors only — they are recomputed from the
 * Payment rows after every create / update / delete and never limit how many
 * payment transactions a patient may have.
 *
 * There is NO refund concept. If cash is handed back immediately, only the amount
 * actually kept by the lab is stored.
 */
@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  // ---------------------------------------------------------------- helpers

  private parseRequiredDate(date: string | null | undefined): Date {
    if (!date) throw new BadRequestException('Payment date is required.');
    return assertLedgerDate(dateOnly(new Date(date)));
  }

  /** Recompute the patient's summary mirrors purely from Payment rows. */
  async resyncPatient(patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return null;
    const rows = await this.prisma.payment.findMany({
      where: { patientId },
      select: { date: true, kind: true, mode: true, amount: true },
    });

    const sums: Record<string, Prisma.Decimal> = {
      advanceCash: ZERO(), advanceUpi: ZERO(), balanceCash: ZERO(), balanceUpi: ZERO(),
    };
    let totalPaid = ZERO();
    let advanceLatest: Date | null = null;
    let balanceLatest: Date | null = null;

    for (const r of rows) {
      const amount = new Prisma.Decimal(r.amount);
      totalPaid = totalPaid.plus(amount);
      const field =
        r.kind === 'advance'
          ? r.mode === 'cash' ? 'advanceCash' : r.mode === 'upi' ? 'advanceUpi' : null
          : r.mode === 'cash' ? 'balanceCash' : r.mode === 'upi' ? 'balanceUpi' : null;
      if (field) sums[field] = sums[field].plus(amount);
      if (r.kind === 'advance') {
        if (!advanceLatest || r.date > advanceLatest) advanceLatest = r.date;
      } else if (!balanceLatest || r.date > balanceLatest) {
        balanceLatest = r.date;
      }
    }

    return this.prisma.patient.update({
      where: { id: patientId },
      data: {
        advanceCash: sums.advanceCash,
        advanceUpi: sums.advanceUpi,
        balanceCash: sums.balanceCash,
        balanceUpi: sums.balanceUpi,
        advancePaidOn: advanceLatest,
        balancePaidOn: balanceLatest,
        balance: new Prisma.Decimal(patient.net).minus(totalPaid),
      } as any,
    });
  }

  private recomputeDates(dates: Array<Date | null | undefined>) {
    const seen = new Set<string>();
    for (const d of dates) {
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      if (seen.has(key)) continue;
      seen.add(key);
      void this.ledger
        .recompute(new Date(key))
        .catch((err) => console.error('[payments] background recompute failed', err));
    }
  }

  // ------------------------------------------------------------------ CRUD

  async record(input: RecordPaymentInput) {
    const patient = await this.prisma.patient.findUnique({ where: { id: input.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const date = this.parseRequiredDate(input.date);
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) throw new BadRequestException('Payment amount must be greater than 0.');

    const payment = await this.prisma.payment.create({
      data: {
        patientId: input.patientId,
        date,
        kind: input.kind,
        mode: input.mode,
        amount,
        notes: input.notes ?? null,
        createdById: input.createdById ?? null,
      },
    });

    const updated = await this.resyncPatient(input.patientId);
    this.recomputeDates([date, patient.entryDate]);
    return { payment, patient: updated };
  }

  /**
   * Update the SAME payment row in place — no reversal / negative correction rows.
   * Changing mode from cash to upi simply flips the mode on this row.
   */
  async update(id: string, input: UpdatePaymentInput) {
    const existing = await this.prisma.payment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Payment not found');

    const date = input.date !== undefined && input.date !== null
      ? this.parseRequiredDate(input.date)
      : existing.date;

    let amount = new Prisma.Decimal(existing.amount);
    if (input.amount !== undefined) {
      amount = new Prisma.Decimal(input.amount);
      if (amount.lessThanOrEqualTo(0)) throw new BadRequestException('Payment amount must be greater than 0.');
    }

    const payment = await this.prisma.payment.update({
      where: { id },
      data: {
        date,
        kind: input.kind ?? existing.kind,
        mode: input.mode ?? existing.mode,
        amount,
        notes: input.notes !== undefined ? input.notes : existing.notes,
      },
    });

    const patient = await this.resyncPatient(existing.patientId);
    this.recomputeDates([existing.date, date, patient?.entryDate]);
    return { payment, patient };
  }

  async remove(id: string) {
    const pay = await this.prisma.payment.findUnique({ where: { id } });
    if (!pay) throw new NotFoundException();
    await this.prisma.payment.delete({ where: { id } });
    const patient = await this.resyncPatient(pay.patientId);
    this.recomputeDates([pay.date, patient?.entryDate]);
    return { ok: true, patient };
  }

  // ------------------------------------------------------------- user views

  /**
   * User-facing netting: legacy correction artefacts (e.g. Cash +350 / Cash -350 /
   * UPI +350) must display as UPI 350 only. Rows are grouped by
   * patientId + date + kind + mode and only groups with a positive net are shown.
   */
  netRows<T extends { id: string; patientId: string; date: Date | string; kind: string; mode: string; amount: any; notes?: string | null; createdAt?: Date }>(
    rows: T[],
  ): T[] {
    const groups = new Map<string, { row: T; total: Prisma.Decimal }>();
    for (const r of rows) {
      const iso = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);
      const key = `${r.patientId}|${iso}|${r.kind}|${r.mode}`;
      const amount = new Prisma.Decimal(r.amount);
      const hit = groups.get(key);
      if (hit) {
        hit.total = hit.total.plus(amount);
        // Keep the earliest positive row as the visible representative.
        if (amount.greaterThan(0) && new Prisma.Decimal(hit.row.amount).lessThanOrEqualTo(0)) hit.row = r;
      } else {
        groups.set(key, { row: r, total: amount });
      }
    }
    return [...groups.values()]
      .filter((g) => g.total.greaterThan(0))
      .map((g) => ({ ...g.row, amount: g.total }));
  }

  /** Clean, netted payment history + summary for one patient. */
  async history(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, net: true, name: true, registerNumber: true, financialYear: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const rows = await this.prisma.payment.findMany({
      where: { patientId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const netted = this.netRows(rows).sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const totalPaid = netted.reduce((s, r) => s.plus(r.amount), ZERO());
    const net = new Prisma.Decimal(patient.net);
    return {
      patientId,
      net,
      totalPaid,
      pending: net.minus(totalPaid),
      overpaid: totalPaid.greaterThan(net) ? totalPaid.minus(net) : ZERO(),
      payments: netted,
    };
  }

  listByPatient(patientId: string) {
    return this.history(patientId).then((h) => h.payments);
  }

  async listByDate(date?: string) {
    const d = date ? dateOnly(new Date(date)) : dateOnly();
    const rows = await this.prisma.payment.findMany({
      where: { date: d },
      orderBy: { createdAt: 'asc' },
      include: {
        patient: {
          select: {
            id: true, name: true, mobile: true, dailySerial: true,
            registerNumber: true, entryDate: true, financialYear: true,
          },
        },
      },
    });
    return this.netRows(rows as any);
  }

  // --------------------------------------------------------------- cleanup

  /**
   * Remove legacy `[form-sync delta]` correction artefacts.
   * ONLY groups (patient+date+kind+mode) that net to zero AND contain a delta row
   * are deleted, plus any standalone negative delta rows netted against their
   * positive counterpart. Genuine instalments on distinct dates/modes are untouched.
   */
  async cleanupDeltas() {
    const rows = await this.prisma.payment.findMany({
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.patientId}|${r.date.toISOString().slice(0, 10)}|${r.kind}|${r.mode}`;
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }

    const toDelete: string[] = [];
    const affectedPatients = new Set<string>();
    const affectedDates = new Set<string>();

    for (const list of groups.values()) {
      const hasDelta = list.some((r) => r.notes === FORM_SYNC_DELTA_NOTE || new Prisma.Decimal(r.amount).lessThan(0));
      if (!hasDelta) continue;
      const total = list.reduce((s, r) => s.plus(r.amount), ZERO());
      if (total.greaterThan(0)) {
        // Net is real money: keep exactly one row carrying the net, drop the artefacts.
        const keep = list.find((r) => new Prisma.Decimal(r.amount).greaterThan(0) && r.notes !== FORM_SYNC_DELTA_NOTE) ?? list[0];
        for (const r of list) if (r.id !== keep.id) toDelete.push(r.id);
        if (!new Prisma.Decimal(keep.amount).equals(total)) {
          await this.prisma.payment.update({ where: { id: keep.id }, data: { amount: total } });
        }
      } else {
        // Nets to zero (or below): the whole group is a correction artefact.
        for (const r of list) toDelete.push(r.id);
      }
      for (const r of list) {
        affectedPatients.add(r.patientId);
        affectedDates.add(r.date.toISOString().slice(0, 10));
      }
    }

    if (toDelete.length) {
      await this.prisma.payment.deleteMany({ where: { id: { in: toDelete } } });
    }
    for (const pid of affectedPatients) await this.resyncPatient(pid);
    this.recomputeDates([...affectedDates].map((d) => new Date(d)));

    return { deleted: toDelete.length, patients: affectedPatients.size, dates: [...affectedDates] };
  }
}
