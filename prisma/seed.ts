import { PrismaClient } from '@prisma/client';
import { seedDemoData } from '../server/src/seed';

const prisma = new PrismaClient();

seedDemoData(prisma, { force: process.argv.includes('--force') })
  .then((res) => {
    console.log(res);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
