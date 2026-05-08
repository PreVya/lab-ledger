import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TestsService {
  constructor(private prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.testCatalog.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  create(data: { name: string; rate: number; outsourced: boolean; outsourcedLab?: string | null }) {
    return this.prisma.testCatalog.create({ data });
  }

  update(id: string, data: Partial<{ name: string; rate: number; outsourced: boolean; outsourcedLab: string | null; active: boolean }>) {
    return this.prisma.testCatalog.update({ where: { id }, data });
  }
}
