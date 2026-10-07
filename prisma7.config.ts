import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const migrationUrl =
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

if (!migrationUrl) {
  throw new Error(
    'DIRECT_URL or DATABASE_URL must be configured for Prisma CLI commands.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: migrationUrl,
  },
});
