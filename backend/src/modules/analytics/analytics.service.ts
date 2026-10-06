import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { isSunday, isLedgerStartDay, LEDGER_START_DATE, LEDGER_START_OPENING_CASH } from '../../config/ledger.config';
import { buildDailyReport, buildMonthlyReport, ReportPatient, ReportPayment, SettlementRow } from './report-builder';

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

  // ================= Daily / Monthly Collection Reports =================
  private num(v: any) { return Number(new Prisma.Decimal(v ?? 0)); }
  private key(d: Date | string) { return typeof d === 'string' ? d.slice(0, 10) : iso(d); }

  private toReportPatient(p: any): ReportPatient {
    return {
      id: p.id, registerNumber: p.registerNumber, financialYear: p.financialYear, name: p.name,
      ageValue: p.ageValue ?? p.age, ageUnit: p.ageUnit, sex: p.sex, entryDate: this.key(p.entryDate),
      total: this.num(p.total), discount: this.num(p.discount), net: this.num(p.net),
      tests: (p.tests ?? []).map((t: any) => ({ name: t.test?.name ?? '', lab: t.test?.outsourced ? t.test?.outsourcedLab ?? null : null, rate: this.num(t.rateAtEntry) })),
    };
  }

  private toReportPayments(rows: any[]): ReportPayment[] {
    return this.payments.netRows(rows as any).map((x: any) => ({
      patientId: x.patientId, date: this.key(x.date), kind: x.kind, mode: x.mode, amount: this.num(x.amount),
    }));
  }

  async dailyReport(date: string) {
    const d = parseDate(date);
    const patients = await this.prisma.patient.findMany({
      where: { entryDate: d },
      include: { tests: { include: { test: true } }, payments: true },
    });
    const dayPayments = this.toReportPayments(patients.flatMap((p: any) => p.payments));

    const prevRaw = await this.prisma.payment.findMany({
      where: { date: d, kind: 'balance', patient: { entryDate: { lt: d } } },
      include: { patient: { select: { registerNumber: true, financialYear: true, name: true, entryDate: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const previous: SettlementRow[] = this.payments.netRows(prevRaw as any).map((x: any) => ({
      date, registerNumber: x.patient.registerNumber, financialYear: x.patient.financialYear, name: x.patient.name,
      entryDate: this.key(x.patient.entryDate), amount: this.num(x.amount), mode: x.mode,
    }));
    return buildDailyReport(date, patients.map((p) => this.toReportPatient(p)), dayPayments, previous);
  }

  async monthlyReport(month: string) {
    const from = parseDate(`${month}-01`);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    const patients = await this.prisma.patient.findMany({
      where: { entryDate: { gte: from, lte: to } },
      include: { tests: { include: { test: true } }, payments: true },
    });
    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    // Balance payments dated in this month (read-only); filtered below to patients entered before the payment date.
    const balRaw = await this.prisma.payment.findMany({
      where: { date: { gte: from, lte: to }, kind: 'balance' },
      include: { patient: { select: { entryDate: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const previousBalance = this.payments.netRows(balRaw as any)
      .map((x: any) => ({ date: this.key(x.date), entry: this.key(x.patient.entryDate), amount: this.num(x.amount) }))
      .filter((x) => x.entry < x.date)
      .map(({ date, amount }) => ({ date, amount }));
    return buildMonthlyReport(
      month, today,
      patients.map((p) => this.toReportPatient(p)),
      this.toReportPayments(patients.flatMap((p: any) => p.payments)),
      previousBalance,
    );
  }

  // ================= Expense / Closing Balance / Doctor / Outsourced reports =================
  // All READ-ONLY. Nothing here creates, updates or deletes any row.

  private range(fromDate: string, toDate: string) {
    return { gte: parseDate(fromDate), lte: parseDate(toDate) };
  }

  /** Expense report — Expense table only. */
  async expenseReport(fromDate: string, toDate: string) {
    const rows = await this.prisma.expense.findMany({
      where: { date: this.range(fromDate, toDate) },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      fromDate, toDate,
      rows: rows.map((e) => ({ id: e.id, date: this.key(e.date), description: e.description, mode: e.mode as string, amount: this.num(e.amount) })),
    };
  }

  /**
   * Closing balance report — same cash formula as the daily ledger summary:
   * closing = opening + cash collection + added cash − cash expenses − cash taken away.
   * Opening follows the ledger rule (start-day cash, else previous ledger day's closing
   * only when that day is closed, else 0). Reads DailyLedger; never writes it.
   */
  async closingBalanceReport(fromDate: string, toDate: string) {
    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const start = fromDate < LEDGER_START_DATE ? LEDGER_START_DATE : fromDate;
    const end = toDate > today ? today : toDate;
    if (end < start) return { fromDate, toDate, rows: [] };
    const range = this.range(start, end);
    const [ledgers, before, payments, expenses, handovers, added] = await Promise.all([
      this.prisma.dailyLedger.findMany({ where: { date: range } }),
      this.prisma.dailyLedger.findFirst({ where: { date: { lt: parseDate(start) } }, orderBy: { date: 'desc' } }),
      this.prisma.payment.findMany({ where: { date: range, mode: 'cash' }, select: { date: true, amount: true } }),
      this.prisma.expense.findMany({ where: { date: range, mode: 'cash' }, select: { date: true, amount: true } }),
      this.prisma.cashHandover.findMany({ where: { date: range }, select: { date: true, amount: true } }),
      this.prisma.cashAdded.findMany({ where: { date: range }, select: { date: true, amount: true } }),
    ]);
    const sumBy = (list: Array<{ date: Date; amount: any }>) => {
      const m = new Map<string, number>();
      for (const x of list) m.set(this.key(x.date), (m.get(this.key(x.date)) ?? 0) + this.num(x.amount));
      return m;
    };
    const cash = sumBy(payments), exp = sumBy(expenses), hand = sumBy(handovers), add = sumBy(added);
    const byDate = new Map(ledgers.map((l) => [this.key(l.date), l]));
    let last: { closingBalance: any; closedAt: Date | null } | null = before;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const rows: any[] = [];
    for (let d = start; d <= end; d = iso(new Date(parseDate(d).getTime() + 86400000))) {
      const day = parseDate(d);
      if (isSunday(day)) continue;
      const opening = isLedgerStartDay(day) ? LEDGER_START_OPENING_CASH : last && last.closedAt ? this.num(last.closingBalance) : 0;
      const row = byDate.get(d);
      const c = cash.get(d) ?? 0, a = add.get(d) ?? 0, e = exp.get(d) ?? 0, h = hand.get(d) ?? 0;
      rows.push({
        date: d, openingCash: r2(opening), cashCollection: r2(c), addedCash: r2(a), cashExpenses: r2(e), cashTakenAway: r2(h),
        closingCash: r2(opening + c + a - e - h), closed: !!row?.closedAt,
      });
      if (row) last = row;
    }
    return { fromDate, toDate, rows };
  }

  /** Doctor / referral-wise report — Patient rows by entryDate, paid from canonical Payment rows. */
  async doctorReport(fromDate: string, toDate: string) {
    const patients = await this.prisma.patient.findMany({
      where: { entryDate: this.range(fromDate, toDate) },
      include: { payments: true },
    });
    const groups = new Map<string, { doctor: string; patientCount: number; total: number; discount: number; net: number; paid: number; balance: number }>();
    for (const p of patients as any[]) {
      const doctor = (p.referredDoctor ?? '').trim() || 'Self / Not specified';
      const k = doctor.toLowerCase();
      const g = groups.get(k) ?? { doctor, patientCount: 0, total: 0, discount: 0, net: 0, paid: 0, balance: 0 };
      const net = this.num(p.net);
      const paid = this.toReportPayments(p.payments).reduce((s, x) => s + (x.amount > 0 ? x.amount : 0), 0);
      g.patientCount += 1; g.total += this.num(p.total); g.discount += this.num(p.discount);
      g.net += net; g.paid += paid; g.balance += Math.max(0, net - paid);
      groups.set(k, g);
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const rows = [...groups.values()]
      .map((g) => ({ ...g, total: r2(g.total), discount: r2(g.discount), net: r2(g.net), paid: r2(g.paid), balance: r2(g.balance) }))
      .sort((a, b) => b.net - a.net || a.doctor.localeCompare(b.doctor));
    return { fromDate, toDate, rows };
  }

  /** Outsourced lab-wise report — outsourced PatientTest rows only, by Patient.entryDate. */
  async outsourcedReport(fromDate: string, toDate: string) {
    const patients = await this.prisma.patient.findMany({
      where: { entryDate: this.range(fromDate, toDate) },
      include: { tests: { include: { test: true } } },
      orderBy: [{ entryDate: 'asc' }, { registerNumber: 'asc' }],
    });
    const details: any[] = [];
    for (const p of patients as any[]) {
      for (const t of p.tests ?? []) {
        const lab = (t.test?.outsourced ? t.test?.outsourcedLab ?? '' : '').trim();
        if (!lab || /in-?house/i.test(lab)) continue;
        details.push({ date: this.key(p.entryDate), registerNumber: p.registerNumber, patientId: p.id, name: p.name, testName: t.test?.name ?? '', lab, rate: this.num(t.rateAtEntry) });
      }
    }
    return { fromDate, toDate, details };
  }
}
