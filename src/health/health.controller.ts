import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness(): Promise<{
    status: 'ok';
    database: 'up';
  }> {
    try {
      await this.prisma.ping();

      return {
        status: 'ok',
        database: 'up',
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is unavailable',
      });
    }
  }
}
