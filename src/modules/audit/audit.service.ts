import {
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { getRequestContext } from '../../common/context/request-context.js';
import { ApiException } from '../../common/exceptions/api.exception.js';
import {
  toPaginatedResult,
  toPaginationWindow,
} from '../../common/utils/pagination.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto.js';

export interface AuditEventInput {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

type AuditWriteClient = Pick<
  Prisma.TransactionClient,
  '$executeRawUnsafe'
>;

const SENSITIVE_KEY =
  /(password|passwordhash|token|secret|authorization|cookie|apikey|api_key|privatekey|private_key)/i;

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async list(query: AuditLogQueryDto) {
    this.assertSort(query.sort);
    this.assertDateRange(
      query.dateFrom,
      query.dateTo,
    );

    const { skip, take } =
      toPaginationWindow(query);
    const search = query.search?.trim();
    const dateFrom = query.dateFrom
      ? this.parseDate(query.dateFrom)
      : undefined;
    const dateTo = query.dateTo
      ? this.dateToExclusive(query.dateTo)
      : undefined;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.userId
        ? { userId: query.userId }
        : {}),
      ...(query.action
        ? { action: query.action }
        : {}),
      ...(query.entityType
        ? { entityType: query.entityType }
        : {}),
      ...(query.entityId
        ? { entityId: query.entityId }
        : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom
                ? { gte: dateFrom }
                : {}),
              ...(dateTo
                ? { lt: dateTo }
                : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                action: {
                  contains: search,
                  mode:
                    'insensitive' as const,
                },
              },
              {
                entityType: {
                  contains: search,
                  mode:
                    'insensitive' as const,
                },
              },
              {
                entityId: {
                  contains: search,
                  mode:
                    'insensitive' as const,
                },
              },
              {
                requestId: {
                  contains: search,
                  mode:
                    'insensitive' as const,
                },
              },
              {
                user: {
                  is: {
                    OR: [
                      {
                        email: {
                          contains: search,
                          mode:
                            'insensitive' as const,
                        },
                      },
                      {
                        firstName: {
                          contains: search,
                          mode:
                            'insensitive' as const,
                        },
                      },
                      {
                        lastName: {
                          contains: search,
                          mode:
                            'insensitive' as const,
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy =
      this.orderBy(
        query.sort,
        query.resolvedOrder,
      );

    const [rows, total] =
      await this.prisma.$transaction([
        this.prisma.auditLog.findMany({
          where,
          skip,
          take,
          orderBy,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        }),
        this.prisma.auditLog.count({
          where,
        }),
      ]);

    return toPaginatedResult(
      rows.map((row) =>
        this.toAuditLog(row),
      ),
      total,
      query,
    );
  }

  async get(id: string) {
    const row =
      await this.prisma.auditLog.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

    if (!row) {
      throw new NotFoundException({
        code: 'AUDIT_LOG_NOT_FOUND',
        message:
          'Audit log entry was not found',
      });
    }

    return this.toAuditLog(row);
  }

  async options() {
    const [actions, entityTypes, users] =
      await Promise.all([
        this.prisma.auditLog.findMany({
          distinct: ['action'],
          orderBy: { action: 'asc' },
          select: { action: true },
        }),
        this.prisma.auditLog.findMany({
          distinct: ['entityType'],
          orderBy: {
            entityType: 'asc',
          },
          select: {
            entityType: true,
          },
        }),
        this.prisma.user.findMany({
          where: {
            auditLogs: {
              some: {},
            },
          },
          orderBy: [
            { firstName: 'asc' },
            { lastName: 'asc' },
            { email: 'asc' },
          ],
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        }),
      ]);

    return {
      actions: actions.map(
        ({ action }) => action,
      ),
      entityTypes:
        entityTypes.map(
          ({ entityType }) =>
            entityType,
        ),
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name:
          user.firstName +
          ' ' +
          user.lastName,
      })),
    };
  }

  async record(
    input: AuditEventInput,
  ): Promise<void> {
    await this.insert(
      this.prisma,
      input,
    );
  }

  async recordInTransaction(
    tx: Prisma.TransactionClient,
    input: AuditEventInput,
  ): Promise<void> {
    await this.insert(tx, input);
  }

  private async insert(
    client: AuditWriteClient,
    input: AuditEventInput,
  ): Promise<void> {
    this.validateEvent(input);
    const context =
      getRequestContext();
    const before =
      this.serializeSnapshot(
        input.before,
      );
    const after =
      this.serializeSnapshot(
        input.after,
      );

    await client.$executeRawUnsafe(
      [
        'INSERT INTO "audit_logs" (',
        '  "id",',
        '  "user_id",',
        '  "action",',
        '  "entity_type",',
        '  "entity_id",',
        '  "before",',
        '  "after",',
        '  "ip_address",',
        '  "request_id"',
        ') VALUES (',
        '  $1::uuid,',
        '  $2::uuid,',
        '  $3::text,',
        '  $4::text,',
        '  $5::text,',
        '  $6::jsonb,',
        '  $7::jsonb,',
        '  $8::text,',
        '  $9::text',
        ')',
      ].join('\n'),
      randomUUID(),
      input.userId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      before,
      after,
      context?.ipAddress ?? null,
      context?.requestId ?? null,
    );
  }

  private validateEvent(
    input: AuditEventInput,
  ): void {
    if (
      !input.action.trim() ||
      input.action.length > 100
    ) {
      throw new Error(
        'Audit action must be between 1 and 100 characters',
      );
    }

    if (
      !input.entityType.trim() ||
      input.entityType.length > 100
    ) {
      throw new Error(
        'Audit entity type must be between 1 and 100 characters',
      );
    }

    if (
      input.entityId &&
      input.entityId.length > 200
    ) {
      throw new Error(
        'Audit entity ID cannot exceed 200 characters',
      );
    }
  }

  private serializeSnapshot(
    value: unknown,
  ): string | null {
    if (value === undefined) {
      return null;
    }

    return JSON.stringify(
      this.sanitize(value, 0),
    );
  }

  private sanitize(
    value: unknown,
    depth: number,
  ): unknown {
    if (depth > 8) {
      return '[TRUNCATED]';
    }

    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'string') {
      return value.length > 4000
        ? value.slice(0, 4000) +
            '…'
        : value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 100)
        .map((item) =>
          this.sanitize(
            item,
            depth + 1,
          ),
        );
    }

    if (
      typeof value === 'object'
    ) {
      const result: Record<
        string,
        unknown
      > = {};

      for (const [
        key,
        item,
      ] of Object.entries(value).slice(
        0,
        100,
      )) {
        result[key] =
          SENSITIVE_KEY.test(key)
            ? '[REDACTED]'
            : this.sanitize(
                item,
                depth + 1,
              );
      }

      return result;
    }

    return String(value);
  }

  private toAuditLog(row: {
    id: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    before: unknown;
    after: unknown;
    ipAddress: string | null;
    requestId: string | null;
    createdAt: Date;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    } | null;
  }) {
    return {
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      ...(row.entityId
        ? {
            entityId:
              row.entityId,
          }
        : {}),
      ...(row.user
        ? {
            actor: {
              id: row.user.id,
              email: row.user.email,
              name:
                row.user.firstName +
                ' ' +
                row.user.lastName,
            },
          }
        : {}),
      before: row.before,
      after: row.after,
      ...(row.ipAddress
        ? {
            ipAddress:
              row.ipAddress,
          }
        : {}),
      ...(row.requestId
        ? {
            requestId:
              row.requestId,
          }
        : {}),
      createdAt: row.createdAt,
    };
  }

  private assertSort(
    sort: string | undefined,
  ): void {
    const allowed = new Set([
      'createdAt',
      'action',
      'entityType',
    ]);

    if (
      sort !== undefined &&
      !allowed.has(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for audit logs',
        statusCode:
          HttpStatus.BAD_REQUEST,
        details: { sort },
      });
    }
  }

  private orderBy(
    sort: string | undefined,
    direction: 'asc' | 'desc',
  ): Prisma.AuditLogOrderByWithRelationInput[] {
    switch (sort) {
      case undefined:
      case 'createdAt':
        return [
          { createdAt: direction },
          { id: direction },
        ];
      case 'action':
        return [
          { action: direction },
          { createdAt: 'desc' },
        ];
      case 'entityType':
        return [
          {
            entityType: direction,
          },
          { createdAt: 'desc' },
        ];
      default:
        throw new Error(
          'Invalid audit sort field',
        );
    }
  }

  private assertDateRange(
    from: string | undefined,
    to: string | undefined,
  ): void {
    if (!from || !to) {
      return;
    }

    if (
      this.parseDate(from) >=
      this.dateToExclusive(to)
    ) {
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
    return new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      )
        ? value +
            'T00:00:00.000Z'
        : value,
    );
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
}
