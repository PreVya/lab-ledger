import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminUsername = 'admin';
  const existing = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existing) {
    await prisma.user.create({
      data: {
        username: adminUsername,
        passwordHash: await bcrypt.hash('admin123', 10),
        fullName: 'System Admin',
        role: Role.admin,
      },
    });
    console.log('Created default admin: admin / admin123');
  }

  const samples = [
    { name: 'CBC', rate: 250, outsourced: false },
    { name: 'Blood Sugar (Fasting)', rate: 80, outsourced: false },
    { name: 'Lipid Profile', rate: 600, outsourced: false },
    { name: 'Thyroid (T3, T4, TSH)', rate: 450, outsourced: false },
    { name: 'HbA1c', rate: 350, outsourced: false },
    { name: 'Vitamin D', rate: 1200, outsourced: true, outsourcedLab: 'Metro Diagnostics' },
  ];
  for (const s of samples) {
    await prisma.testCatalog.upsert({
      where: { name: s.name },
      update: {},
      create: s as any,
    });
  }
  console.log('Seeded test catalog');
}

main().finally(() => prisma.$disconnect());
