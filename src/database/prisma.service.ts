import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleDestroy
{
  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('database.url');
    const adapter = new PrismaPg({ connectionString });

    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<void> {
    await this.$queryRawUnsafe('SELECT 1');
  }
}
