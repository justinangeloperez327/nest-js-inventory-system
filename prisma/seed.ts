import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'inventory.allowNegativeStock' },
    update: {},
    create: {
      key: 'inventory.allowNegativeStock',
      value: false,
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'inventory.defaultPageSize' },
    update: {},
    create: {
      key: 'inventory.defaultPageSize',
      value: 25,
    },
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
