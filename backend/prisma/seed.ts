import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const users: Array<{ username: string; password: string; fullName: string; role: Role }> = [
    { username: 'admin', password: 'admin', fullName: 'System Admin', role: Role.admin },
    { username: 'prer', password: 'prer', fullName: 'Prer', role: Role.receptionist },
    { username: 'gaya', password: 'gaya', fullName: 'Gaya', role: Role.technician },
  ];

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (existing) {
      await prisma.user.update({
        where: { username: u.username },
        data: { passwordHash: await bcrypt.hash(u.password, 10), fullName: u.fullName, role: u.role, active: true },
      });
      console.log(`Updated user: ${u.username} / ${u.password}`);
    } else {
      await prisma.user.create({
        data: { username: u.username, passwordHash: await bcrypt.hash(u.password, 10), fullName: u.fullName, role: u.role },
      });
      console.log(`Created user: ${u.username} / ${u.password}`);
    }
  }

  // Test catalog — uniqueness is enforced by functional index over
  // (lower(trim(name)), coalesce(lower(trim(outsourcedLab)), 'INHOUSE')).
  const samples = [
    { name: 'CBC', rate: 250, outsourced: false, outsourcedLab: null },
    { name: 'Blood Sugar (Fasting)', rate: 80, outsourced: false, outsourcedLab: null },
    { name: 'Lipid Profile', rate: 600, outsourced: false, outsourcedLab: null },
    { name: 'Thyroid (T3, T4, TSH)', rate: 450, outsourced: false, outsourcedLab: null },
    { name: 'HbA1c', rate: 350, outsourced: false, outsourcedLab: null },
    { name: 'Vitamin D', rate: 1200, outsourced: true, outsourcedLab: 'Metro Diagnostics' },
  ];
  for (const s of samples) {
    const exists = await prisma.testCatalog.findFirst({
      where: { name: s.name, outsourcedLab: s.outsourcedLab },
    });
    if (!exists) {
      await prisma.testCatalog.create({ data: s as any });
    }
  }
  console.log('Seeded test catalog');
}

main().finally(() => prisma.$disconnect());
