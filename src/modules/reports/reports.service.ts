import {
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ApiException } from '../../common/exceptions/api.exception.js';
import { createPaginationMeta } from '../../common/utils/pagination.util.js';
import {
  assertQueryDateRange,
  parseQueryDate,
  queryDateToExclusive,
} from '../../common/utils/query-date.util.js';
import { sqlContainsPattern } from '../../common/utils/query-search.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  STOCK_MOVEMENT_DB_TYPE,
  STOCK_MOVEMENT_TYPES,
} from '../stock-movements/stock-movement.types.js';
import {
  REPORT_EXPORT_MAX_ROWS,
  REPORT_IDS,
  type ReportId,
} from './report.constants.js';
import {
  REPORT_SPECS,
  type ReportSpec,
} from './report-specs.js';
import type { ReportQueryDto } from './dto/report-query.dto.js';

type ReportRow = Record<string, unknown>;
type SummaryRow = Record<string, unknown> & {
  totalItems?: number;
};

interface GeneratedAtRow {
  generatedAt: Date;
}

interface ReportParams {
  warehouseId: string | null;
  movementType: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  searchPattern: string | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async options() {
    const warehouses =
      await this.prisma.warehouse.findMany({
        where: { isActive: true },
        orderBy: [
          { name: 'asc' },
          { code: 'asc' },
        ],
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

    return {
      warehouses,
      movementTypes:
        STOCK_MOVEMENT_TYPES.map(
          (value) => ({
            value,
            label: this.movementLabel(value),
          }),
        ),
    };
  }

  async run(
    id: string,
    query: ReportQueryDto,
  ) {
    const spec = this.getSpec(id);
    const params = this.params(query);
    const sort = this.resolveSort(
      spec,
      query.sort,
    );
    const direction = query.resolvedOrder;
    const offset =
      (query.page - 1) * query.pageSize;

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
        );

        const generatedRows =
          await tx.$queryRawUnsafe<
            GeneratedAtRow[]
          >(
            'SELECT transaction_timestamp() AS "generatedAt"',
          );

        const summaryRows =
          await tx.$queryRawUnsafe<
            SummaryRow[]
          >(
            spec.summarySql,
            params.warehouseId,
            params.movementType,
            params.dateFrom,
            params.dateTo,
            params.searchPattern,
          );

        const summaryRow =
          summaryRows[0] ?? {
            totalItems: 0,
          };
        const totalItems =
          this.totalItems(summaryRow);
        const rows =
          await tx.$queryRawUnsafe<
            ReportRow[]
          >(
            this.dataQuery(
              spec,
              sort,
              direction,
            ),
            params.warehouseId,
            params.movementType,
            params.dateFrom,
            params.dateTo,
            params.searchPattern,
            query.pageSize,
            offset,
          );

        return {
          data: rows,
          pagination:
            createPaginationMeta(
              query,
              totalItems,
            ),
          summary:
            this.publicSummary(
              summaryRow,
            ),
          generatedAt:
            generatedRows[0]
              ?.generatedAt ??
            new Date(),
          ...(spec.currency
            ? {
                currencyCode:
                  await this.settings.currencyCodeInTransaction(
                    tx,
                  ),
              }
            : {}),
        };
      },
    );
  }

  async exportCsv(
    id: string,
    query: ReportQueryDto,
  ): Promise<{
    content: string;
    filename: string;
  }> {
    const spec = this.getSpec(id);
    const params = this.params(query);
    const sort = this.resolveSort(
      spec,
      query.sort,
    );
    const direction = query.resolvedOrder;

    const rows =
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
          );

          const summaryRows =
            await tx.$queryRawUnsafe<
              SummaryRow[]
            >(
              spec.summarySql,
              params.warehouseId,
              params.movementType,
              params.dateFrom,
              params.dateTo,
              params.searchPattern,
            );
          const totalItems =
            this.totalItems(
              summaryRows[0] ?? {
                totalItems: 0,
              },
            );

          if (
            totalItems >
            REPORT_EXPORT_MAX_ROWS
          ) {
            throw new ApiException({
              code:
                'REPORT_EXPORT_TOO_LARGE',
              message:
                'The report export exceeds the maximum supported row count. Narrow the report filters and try again.',
              statusCode:
                HttpStatus.PAYLOAD_TOO_LARGE,
              details: {
                totalItems,
                maximumRows:
                  REPORT_EXPORT_MAX_ROWS,
              },
            });
          }

          return tx.$queryRawUnsafe<
            ReportRow[]
          >(
            this.dataQuery(
              spec,
              sort,
              direction,
            ),
            params.warehouseId,
            params.movementType,
            params.dateFrom,
            params.dateTo,
            params.searchPattern,
            Math.max(
              totalItems,
              1,
            ),
            0,
          );
        },
      );

    return {
      content: this.toCsv(
        spec,
        rows,
      ),
      filename:
        spec.id +
        '-' +
        new Date()
          .toISOString()
          .slice(0, 10) +
        '.csv',
    };
  }

  private getSpec(id: string): ReportSpec {
    if (
      !REPORT_IDS.includes(
        id as ReportId,
      )
    ) {
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: 'Report was not found',
      });
    }

    return REPORT_SPECS[id as ReportId];
  }

  private params(
    query: ReportQueryDto,
  ): ReportParams {
    assertQueryDateRange(
      query.dateFrom,
      query.dateTo,
    );

    return {
      warehouseId:
        query.warehouseId ?? null,
      movementType:
        query.movementType
          ? STOCK_MOVEMENT_DB_TYPE[
              query.movementType
            ]
          : null,
      dateFrom:
        parseQueryDate(
          query.dateFrom,
          'dateFrom',
        ),
      dateTo:
        queryDateToExclusive(
          query.dateTo,
          'dateTo',
        ),
      searchPattern:
        sqlContainsPattern(
          query.search,
        ),
    };
  }

  private resolveSort(
    spec: ReportSpec,
    requested: string | undefined,
  ): string {
    const sort =
      requested ?? spec.defaultSort;
    const expression =
      spec.sorts[sort];

    if (!expression) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for report',
        statusCode:
          HttpStatus.BAD_REQUEST,
        details: {
          reportId: spec.id,
          sort,
        },
      });
    }

    return expression;
  }

  private dataQuery(
    spec: ReportSpec,
    sortExpression: string,
    direction: 'asc' | 'desc',
  ): string {
    const sqlDirection =
      direction === 'desc'
        ? 'DESC'
        : 'ASC';

    return [
      spec.dataSql,
      'ORDER BY ' +
        sortExpression +
        ' ' +
        sqlDirection +
        ', ' +
        spec.tieBreaker,
      'LIMIT $6 OFFSET $7',
    ].join('\n');
  }

  private totalItems(
    row: SummaryRow,
  ): number {
    const value = Number(
      row.totalItems ?? 0,
    );

    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new Error(
        'Report summary returned an invalid totalItems value',
      );
    }

    return Math.trunc(value);
  }

  private publicSummary(
    row: SummaryRow,
  ): Record<string, unknown> {
    const summary = { ...row };
    delete summary.totalItems;
    return summary;
  }

  private assertDateRange(
    dateFrom: string | undefined,
    dateTo: string | undefined,
  ): void {
    if (!dateFrom || !dateTo) {
      return;
    }

    const from =
      this.parseDate(dateFrom);
    const to =
      this.dateToExclusive(
        dateTo,
      );

    if (from >= to) {
      throw new ApiException({
        code: 'INVALID_DATE_RANGE',
        message:
          'dateFrom must be before or equal to dateTo',
        statusCode:
          HttpStatus.BAD_REQUEST,
      });
    }
  }

  private parseDate(
    value: string,
  ): Date {
    const dateOnly =
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      );
    const date = new Date(
      dateOnly
        ? value +
            'T00:00:00.000Z'
        : value,
    );

    if (
      Number.isNaN(
        date.getTime(),
      ) ||
      (dateOnly &&
        date
          .toISOString()
          .slice(0, 10) !==
          value)
    ) {
      throw new ApiException({
        code: 'INVALID_DATE',
        message:
          'Report date filter is invalid',
        statusCode:
          HttpStatus.BAD_REQUEST,
      });
    }

    return date;
  }

  private dateToExclusive(
    value: string,
  ): Date {
    const date =
      this.parseDate(value);

    if (
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      )
    ) {
      date.setUTCDate(
        date.getUTCDate() + 1,
      );
      return date;
    }

    return new Date(
      date.getTime() + 1,
    );
  }


  private movementLabel(
    value:
      (typeof STOCK_MOVEMENT_TYPES)[number],
  ): string {
    return value
      .split('-')
      .map(
        (part) =>
          part.charAt(0).toUpperCase() +
          part.slice(1),
      )
      .join(' ');
  }

  private toCsv(
    spec: ReportSpec,
    rows: ReportRow[],
  ): string {
    const header =
      spec.csvColumns
        .map((column) =>
          this.csvCell(
            column.label,
          ),
        )
        .join(',');

    const body = rows.map((row) =>
      spec.csvColumns
        .map((column) =>
          this.csvCell(
            row[column.key],
          ),
        )
        .join(','),
    );

    return (
      '\uFEFF' +
      [header, ...body].join(
        '\r\n',
      ) +
      '\r\n'
    );
  }

  private csvCell(
    value: unknown,
  ): string {
    if (
      value === null ||
      value === undefined
    ) {
      return '';
    }

    let text: string;

    if (value instanceof Date) {
      text = value.toISOString();
    } else {
      text = String(value);
    }

    if (
      typeof value === 'string' &&
      /^[=+\-@\t\r]/.test(text)
    ) {
      text = "'" + text;
    }

    if (
      /[",\r\n]/.test(text)
    ) {
      return (
        '"' +
        text.replace(
          /"/g,
          '""',
        ) +
        '"'
      );
    }

    return text;
  }
}
