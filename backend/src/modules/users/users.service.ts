import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: { id: true, username: true, fullName: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: { username: string; password: string; fullName: string; role: Role }) {
    return this.prisma.user.create({
      data: {
        username: input.username,
        fullName: input.fullName,
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, 10),
      },
      select: { id: true, username: true, fullName: true, role: true, active: true },
    });
  }

  async setActive(id: string, active: boolean) {
    return this.prisma.user.update({ where: { id }, data: { active } });
  }

  async resetPassword(id: string, password: string) {
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
  }
}
