import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { ReportExportQueryDto } from './dto/report-export-query.dto.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions(Permission.ReportsView)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
  ) {}

  @Get('options')
  options() {
    return this.reports.options();
  }

  @Get(':id/export')
  async exportCsv(
    @Param('id') id: string,
    @Query() query: ReportExportQueryDto,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const exported =
      await this.reports.exportCsv(
        id,
        query,
      );

    response.setHeader(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="' +
        exported.filename +
        '"',
    );

    return new StreamableFile(
      Buffer.from(
        exported.content,
        'utf8',
      ),
    );
  }

  @Get(':id')
  run(
    @Param('id') id: string,
    @Query() query: ReportQueryDto,
  ) {
    return this.reports.run(id, query);
  }
}
