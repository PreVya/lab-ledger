import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';

/**
 * Phase 4 Analytics — first 8 reports only.
 *
 * STRICT DEFINITIONS:
 *  - Collection        = money actually received  -> Payment rows, by Payment.date
 *  - Patient business  = value of tests after discount -> Patient.net, by Patient.entryDate
 *  - Discount          = Patient.discount, by Patient.entryDate
 *
 * DailyLedger.openingBalance / closingBalance, cash handover, cash added and
 * expenses are NEVER read here. They are not collection.
 */

export interface PeriodRow {
  key: string;
  label: string;
  cash: number;
  upi: number;
  card: number;
  other: number;
  advance: number;
  balance: number;
  net: number;
}

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function parseDate(s: string) { return new Date(`${s}T00:00:00.000Z`); }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dayLabel(key: string) {
  const [y, m, d] = key.split('-');
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

/** Monday-based week start for a YYYY-MM-DD key. */
function weekStart(key: string) {
  const d = parseDate(key);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return iso(d);
}

function weekLabel(startKey: string) {
  const end = parseDate(startKey);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${dayLabel(startKey)} — ${dayLabel(iso(end))}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService, private payments: PaymentsService) {}

  async summary(fromDate: string, toDate: string) {
    const from = parseDate(fromDate);
    const to = parseDate(toDate);

    // ---- Collection: Payment rows only, netted so legacy correction artefacts
    // never distort the numbers. Negative / zero-net groups are dropped.
    const rawPayments = await this.prisma.payment.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const payments = this.payments.netRows(rawPayments as any);

    let cash = 0, upi = 0, card = 0, other = 0, advance = 0, balance = 0, netCollection = 0;
    const daily = new Map<string, PeriodRow>();
    const weekly = new Map<string, PeriodRow>();
    const monthly = new Map<string, PeriodRow>();

    const blank = (key: string, label: string): PeriodRow => ({
      key, label, cash: 0, upi: 0, card: 0, other: 0, advance: 0, balance: 0, net: 0,
    });

    for (const p of payments) {
      const amount = Number(new Prisma.Decimal(p.amount as any));
      if (!(amount > 0)) continue;
      const key = typeof p.date === 'string' ? String(p.date).slice(0, 10) : iso(p.date as Date);

      netCollection += amount;
      if (p.mode === 'cash') cash += amount;
      else if (p.mode === 'upi') upi += amount;
      else if (p.mode === 'card') card += amount;
      else other += amount;
      if (p.kind === 'advance') advance += amount; else balance += amount;

      const buckets: Array<[Map<string, PeriodRow>, string, string]> = [
        [daily, key, dayLabel(key)],
        [weekly, weekStart(key), weekLabel(weekStart(key))],
        [monthly, key.slice(0, 7), monthLabel(key.slice(0, 7))],
      ];
      for (const [map, k, label] of buckets) {
        const row = map.get(k) ?? blank(k, label);
        row.net += amount;
        if (p.mode === 'cash') row.cash += amount;
        else if (p.mode === 'upi') row.upi += amount;
        else if (p.mode === 'card') row.card += amount;
        else row.other += amount;
        if (p.kind === 'advance') row.advance += amount; else row.balance += amount;
        map.set(k, row);
      }
    }

    // ---- Legacy fallback: patients created before the Payment table became
    // canonical hold their money only on the Patient row. Counted ONLY when the
    // patient has no Payment rows at all, so nothing can ever be double counted.
    const legacy = await this.prisma.patient.findMany({
      where: {
        payments: { none: {} },
        OR: [
          { entryDate: { gte: from, lte: to } },
          { advancePaidOn: { gte: from, lte: to } },
          { balancePaidOn: { gte: from, lte: to } },
        ],
      },
      select: {
        entryDate: true,
        advanceCash: true, advanceUpi: true, advancePaidOn: true,
        balanceCash: true, balanceUpi: true, balancePaidOn: true,
      },
    });

    const addLegacy = (
      when: Date | null,
      fallback: Date,
      kind: 'advance' | 'balance',
      mode: 'cash' | 'upi',
      raw: any,
    ) => {
      const amount = Number(new Prisma.Decimal(raw ?? 0));
      if (!(amount > 0)) return;
      const d = when ?? fallback;
      const key = iso(d);
      if (key < fromDate || key > toDate) return;

      netCollection += amount;
      if (mode === 'cash') cash += amount; else upi += amount;
      if (kind === 'advance') advance += amount; else balance += amount;

      const buckets: Array<[Map<string, PeriodRow>, string, string]> = [
        [daily, key, dayLabel(key)],
        [weekly, weekStart(key), weekLabel(weekStart(key))],
        [monthly, key.slice(0, 7), monthLabel(key.slice(0, 7))],
      ];
      for (const [map, k, label] of buckets) {
        const row = map.get(k) ?? blank(k, label);
        row.net += amount;
        if (mode === 'cash') row.cash += amount; else row.upi += amount;
        if (kind === 'advance') row.advance += amount; else row.balance += amount;
        map.set(k, row);
      }
    };

    let legacyRows = 0;
    for (const p of legacy) {
      const before = netCollection;
      addLegacy(p.advancePaidOn, p.entryDate, 'advance', 'cash', p.advanceCash);
      addLegacy(p.advancePaidOn, p.entryDate, 'advance', 'upi', p.advanceUpi);
      addLegacy(p.balancePaidOn, p.entryDate, 'balance', 'cash', p.balanceCash);
      addLegacy(p.balancePaidOn, p.entryDate, 'balance', 'upi', p.balanceUpi);
      if (netCollection !== before) legacyRows += 1;
    }

    // ---- Patient business + discount: Patient rows only, by entryDate.
    const patients = await this.prisma.patient.findMany({
      where: { entryDate: { gte: from, lte: to } },
      select: { net: true, discount: true },
    });
    let totalPatientBusiness = 0, totalDiscount = 0;
    for (const p of patients) {
      totalPatientBusiness += Number(new Prisma.Decimal(p.net));
      totalDiscount += Number(new Prisma.Decimal(p.discount));
    }

    // Temporary diagnostics while the all-zero report is being verified.
    // eslint-disable-next-line no-console
    console.log(
      `Analytics debug: fromDate=${fromDate} toDate=${toDate} ` +
        `paymentsFound=${rawPayments.length} nettedPayments=${payments.length} ` +
        `legacyPatientsCounted=${legacyRows} patientsFound=${patients.length} ` +
        `modes=[${[...new Set(rawPayments.map((p) => p.mode))].join(', ')}] ` +
        `kinds=[${[...new Set(rawPayments.map((p) => p.kind))].join(', ')}] ` +
        `netCollection=${netCollection} patientBusiness=${totalPatientBusiness}`,
    );

    const pct = (v: number) => (netCollection > 0 ? (v / netCollection) * 100 : 0);
    const sortRows = (m: Map<string, PeriodRow>) =>
      [...m.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    return {
      fromDate,
      toDate,
      netCollection,
      cashCollection: cash,
      upiCollection: upi,
      cardCollection: card,
      otherCollection: other,
      totalPatientBusiness,
      totalDiscount,
      advanceReceived: advance,
      balanceReceived: balance,
      collectionGap: totalPatientBusiness - netCollection,
      patientCount: patients.length,
      paymentModeSplit: [
        { mode: 'cash', amount: cash, percent: pct(cash) },
        { mode: 'upi', amount: upi, percent: pct(upi) },
        { mode: 'card', amount: card, percent: pct(card) },
        { mode: 'other', amount: other, percent: pct(other) },
      ],
      advanceBalanceSplit: [
        { kind: 'advance', amount: advance, percent: pct(advance) },
        { kind: 'balance', amount: balance, percent: pct(balance) },
      ],
      dailyCollectionRows: sortRows(daily),
      weeklyCollectionRows: sortRows(weekly),
      monthlyCollectionRows: sortRows(monthly),
    };
  }
}
