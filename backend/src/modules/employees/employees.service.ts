import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export interface UpsertEmployeeInput {
  name: string;
  mobile?: string | null;
  designation?: string | null;
  monthlySalary?: number;
  active?: boolean;
  linkedUserId?: string | null;
}

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  list(activeOnly?: boolean) {
    return this.prisma.employee.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { aadhaarDocument: { select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true } } },
    });
  }

  get(id: string) {
    return this.prisma.employee.findUnique({
      where: { id },
      include: { aadhaarDocument: { select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true } } },
    });
  }

  /**
   * Create-then-upload flow:
   * 1. Create employee row with aadhaarDocumentId = null.
   * 2. Upload Aadhaar file (path uses new employee id).
   * 3. Update employee.aadhaarDocumentId.
   * On upload failure the employee is rolled back.
   */
  async createWithAadhaar(input: UpsertEmployeeInput, file: Express.Multer.File | undefined, uploadedById?: string | null) {
    if (!input.name?.trim()) throw new BadRequestException('Name required');
    const employee = await this.prisma.employee.create({
      data: {
        name: input.name.trim(),
        mobile: input.mobile ?? null,
        designation: input.designation ?? null,
        monthlySalary: new Prisma.Decimal(input.monthlySalary ?? 0),
        active: input.active ?? true,
        linkedUserId: input.linkedUserId || null,
      },
    });
    if (!file) return this.get(employee.id);
    try {
      const stored = await this.storage.uploadEmployeeAadhaar(employee.id, file, uploadedById);
      await this.prisma.employee.update({ where: { id: employee.id }, data: { aadhaarDocumentId: stored.id } });
    } catch (err) {
      await this.prisma.employee.delete({ where: { id: employee.id } }).catch(() => undefined);
      throw err;
    }
    return this.get(employee.id);
  }

  async update(id: string, input: Partial<UpsertEmployeeInput>, file: Express.Multer.File | undefined, uploadedById?: string | null) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Employee not found');
    const data: Prisma.EmployeeUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.mobile !== undefined) data.mobile = input.mobile;
    if (input.designation !== undefined) data.designation = input.designation;
    if (input.monthlySalary !== undefined) data.monthlySalary = new Prisma.Decimal(input.monthlySalary);
    if (input.active !== undefined) data.active = input.active;
    if (input.linkedUserId !== undefined) data.linkedUserId = input.linkedUserId || null;
    await this.prisma.employee.update({ where: { id }, data });
    if (file) {
      const stored = await this.storage.uploadEmployeeAadhaar(id, file, uploadedById);
      const oldId = existing.aadhaarDocumentId;
      await this.prisma.employee.update({ where: { id }, data: { aadhaarDocumentId: stored.id } });
      if (oldId) await this.storage.deleteStoredFile(oldId);
    }
    return this.get(id);
  }

  async deactivate(id: string) {
    await this.prisma.employee.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }

  async aadhaarSignedUrl(id: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id }, select: { aadhaarDocumentId: true } });
    if (!emp) throw new NotFoundException('Employee not found');
    if (!emp.aadhaarDocumentId) throw new NotFoundException('No Aadhaar uploaded');
    return this.storage.getSignedUrl(emp.aadhaarDocumentId, 300);
  }
}
