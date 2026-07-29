import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dateOnly } from '../ledger/ledger.service';
import { financialYearFor } from '../patients/fy';
import { amountInWords } from './words';

const BILL_INCLUDE = { items: { orderBy: { sortOrder: 'asc' as const } } };

export interface ListBillsFilters {
  from?: string;
  to?: string;
  q?: string;
  billNumber?: number;
}

@Injectable()
export class BillsService {
  constructor(private prisma: PrismaService) {}

  /** Existing bill for a patient, or null. Never creates anything. */
  byPatient(patientId: string) {
    return this.prisma.bill.findFirst({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: BILL_INCLUDE,
    });
  }

  async get(id: string) {
    const bill = await this.prisma.bill.findUnique({ where: { id }, include: BILL_INCLUDE });
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  /**
   * Manual bill generation. Idempotent: if a bill already exists for the
   * patient it is returned as-is (same billNumber, no new snapshot).
   * NOTE: this never touches Patient / Payment / Ledger data.
   */
  async generate(patientId: string, createdById?: string) {
    const existing = await this.byPatient(patientId);
    if (existing) return existing;

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { tests: { include: { test: true } } },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    if (!patient.tests.length) throw new BadRequestException('Patient has no tests to bill');

    const billDate = dateOnly();
    const fy = financialYearFor(billDate);

    const paid =
      Number(patient.advanceCash) + Number(patient.advanceUpi) +
      Number(patient.balanceCash) + Number(patient.balanceUpi);
    const net = Number(patient.net);
    const balance = Number(patient.balance);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Bill numbers are global and never reset (independent of register no.).
          const last = await tx.bill.findFirst({ orderBy: { billNumber: 'desc' }, select: { billNumber: true } });
          const billNumber = (last?.billNumber ?? 0) + 1;

          return tx.bill.create({
            data: {
              billNumber,
              financialYear: fy,
              billDate,
              patientId: patient.id,
              patientRegisterNumberSnapshot: patient.registerNumber,
              patientFinancialYearSnapshot: patient.financialYear,
              patientNameSnapshot: patient.name,
              patientAgeSnapshot: `${patient.ageValue ?? patient.age} ${patient.ageUnit ?? 'years'}`,
              patientSexSnapshot: patient.sex,
              patientMobileSnapshot: patient.mobile || null,
              referredDoctorSnapshot: patient.referredDoctor ?? null,
              totalAmount: patient.total,
              discount: patient.discount,
              netAmount: patient.net,
              paidAmount: new Prisma.Decimal(paid),
              balanceAmount: new Prisma.Decimal(balance),
              amountInWords: amountInWords(net),
              createdById: createdById ?? null,
              items: {
                create: patient.tests.map((pt, i) => ({
                  sortOrder: i + 1,
                  testName: pt.test.name,
                  testCode: pt.test.testCode ?? null,
                  outsourcedLab: pt.test.outsourced ? pt.test.outsourcedLab ?? null : null,
                  rate: pt.rateAtEntry,
                  quantity: 1,
                  amount: pt.rateAtEntry,
                })),
              },
            },
            include: BILL_INCLUDE,
          });
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
    throw new BadRequestException('Could not assign a bill number, please retry');
  }

  async markPrinted(id: string, printedById?: string) {
    await this.get(id);
    return this.prisma.bill.update({
      where: { id },
      data: { printCount: { increment: 1 }, printedAt: new Date(), printedById: printedById ?? null },
      include: BILL_INCLUDE,
    });
  }

  list(f: ListBillsFilters) {
    const where: Prisma.BillWhereInput = {};
    if (f.from || f.to) {
      where.billDate = {
        ...(f.from ? { gte: dateOnly(new Date(f.from)) } : {}),
        ...(f.to ? { lte: dateOnly(new Date(f.to)) } : {}),
      };
    }
    if (f.billNumber) where.billNumber = f.billNumber;
    if (f.q?.trim()) where.patientNameSnapshot = { contains: f.q.trim(), mode: 'insensitive' };
    return this.prisma.bill.findMany({
      where,
      orderBy: { billNumber: 'desc' },
      take: 200,
      include: BILL_INCLUDE,
    });
  }
}
