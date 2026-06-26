import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Duplicate rule (Phase 1.75):
 * Same `name` may exist multiple times when `outsourcedLab` differs.
 * Exact duplicates are prevented by a DB functional unique index over
 * (lower(trim(name)), coalesce(lower(trim(outsourcedLab)), 'INHOUSE')).
 */
@Injectable()
export class TestsService {
  constructor(private prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.testCatalog.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ name: 'asc' }, { outsourcedLab: 'asc' }],
    });
  }

  async create(data: { name: string; rate: number; outsourced: boolean; outsourcedLab?: string | null }) {
    try {
      return await this.prisma.testCatalog.create({
        data: {
          name: data.name.trim(),
          rate: data.rate,
          outsourced: data.outsourced,
          outsourcedLab: data.outsourced ? (data.outsourcedLab?.trim() || null) : null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A test with the same name and provider already exists.');
      }
      throw e;
    }
  }

  async update(
    id: string,
    data: Partial<{ name: string; rate: number; outsourced: boolean; outsourcedLab: string | null; active: boolean }>,
  ) {
    try {
      return await this.prisma.testCatalog.update({
        where: { id },
        data: {
          ...data,
          name: data.name?.trim(),
          outsourcedLab:
            data.outsourced === false
              ? null
              : data.outsourcedLab !== undefined
                ? data.outsourcedLab?.trim() || null
                : undefined,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A test with the same name and provider already exists.');
      }
      throw e;
    }
  }
}
