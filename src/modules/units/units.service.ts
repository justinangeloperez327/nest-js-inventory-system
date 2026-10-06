import {
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ApiException } from '../../common/exceptions/api.exception.js';
import {
  toPaginatedResult,
  toPaginationWindow,
} from '../../common/utils/pagination.util.js';
import { prismaContainsSearch } from '../../common/utils/query-search.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { UnitListQueryDto } from './dto/unit-list-query.dto.js';
import type { UnitStatusDto } from './dto/unit-status.dto.js';
import type { UnitUpsertDto } from './dto/unit-upsert.dto.js';

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: UnitListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search =
      prismaContainsSearch(
        query.search,
      );

    const where = {
      ...(query.active !== undefined
        ? { isActive: query.active }
        : {}),
      ...(search
        ? {
            OR: [
              {
                code: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                name: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                symbol: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [units, totalItems] =
      await this.prisma.$transaction([
        this.prisma.unit.findMany({
          where,
          skip,
          take,
          orderBy: [
            this.orderBy(
              query.sort,
              query.resolvedOrder,
            ),
            { id: 'asc' as const },
          ],
        }),
        this.prisma.unit.count({ where }),
      ]);

    return toPaginatedResult(
      units.map((unit) => this.toUnit(unit)),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
    });

    if (!unit) {
      throw this.notFound();
    }

    return this.toUnit(unit);
  }

  async create(
    dto: UnitUpsertDto,
    userId: string,
  ) {
    await this.assertUnique(
      dto.code,
      dto.name,
      dto.symbol,
    );

    try {
      const unit =
        await this.prisma.$transaction(
          async (tx) => {
            const created =
              await tx.unit.create({
                data: {
                  code: dto.code,
                  name: dto.name,
                  symbol: dto.symbol,
                },
              });

            const after =
              this.toUnit(created);

            await this.audit.recordInTransaction(
              tx,
              {
                userId,
                action: 'unit.created',
                entityType: 'unit',
                entityId: created.id,
                after,
              },
            );

            return created;
          },
        );

      return this.toUnit(unit);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UnitUpsertDto,
    userId: string,
  ) {
    await this.requireUnit(id);
    const before = await this.get(id);
    await this.assertUnique(
      dto.code,
      dto.name,
      dto.symbol,
      id,
    );

    try {
      const unit =
        await this.prisma.$transaction(
          async (tx) => {
            const updated =
              await tx.unit.update({
                where: { id },
                data: {
                  code: dto.code,
                  name: dto.name,
                  symbol: dto.symbol,
                },
              });

            const after =
              this.toUnit(updated);

            await this.audit.recordInTransaction(
              tx,
              {
                userId,
                action:
                  'unit.updated',
                entityType: 'unit',
                entityId: id,
                before,
                after,
              },
            );

            return updated;
          },
        );

      return this.toUnit(unit);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async setStatus(
    id: string,
    dto: UnitStatusDto,
    userId: string,
  ) {
    await this.requireUnit(id);
    const before = await this.get(id);

    const unit =
      await this.prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.unit.update({
              where: { id },
              data: {
                isActive: dto.active,
              },
            });

          const after =
            this.toUnit(updated);

          await this.audit.recordInTransaction(
            tx,
            {
              userId,
              action:
                'unit.status_changed',
              entityType: 'unit',
              entityId: id,
              before,
              after,
            },
          );

          return updated;
        },
      );

    return this.toUnit(unit);
  }

  private async requireUnit(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!unit) {
      throw this.notFound();
    }

    return unit;
  }

  private async assertUnique(
    code: string,
    name: string,
    symbol: string,
    excludeId?: string,
  ): Promise<void> {
    const existing =
      await this.prisma.unit.findFirst({
        where: {
          OR: [
            {
              code: {
                equals: code,
                mode: 'insensitive',
              },
            },
            {
              name: {
                equals: name,
                mode: 'insensitive',
              },
            },
            {
              symbol: {
                equals: symbol,
                mode: 'insensitive',
              },
            },
          ],
          ...(excludeId
            ? { NOT: { id: excludeId } }
            : {}),
        },
        select: {
          code: true,
          name: true,
          symbol: true,
        },
      });

    if (!existing) {
      return;
    }

    if (
      existing.code.toLocaleLowerCase() ===
      code.toLocaleLowerCase()
    ) {
      throw this.codeConflict();
    }

    if (
      existing.name.toLocaleLowerCase() ===
      name.toLocaleLowerCase()
    ) {
      throw this.nameConflict();
    }

    throw this.symbolConflict();
  }

  private rethrowUniqueConstraint(error: unknown): void {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      (error as { code?: unknown }).code !== 'P2002'
    ) {
      return;
    }

    const target = (
      error as {
        meta?: { target?: unknown };
      }
    ).meta?.target;
    const fields = Array.isArray(target)
      ? target.filter(
          (value): value is string =>
            typeof value === 'string',
        )
      : [];

    if (
      fields.some((field) =>
        field.toLowerCase().includes('code'),
      )
    ) {
      throw this.codeConflict();
    }

    if (
      fields.some((field) =>
        field.toLowerCase().includes('symbol'),
      )
    ) {
      throw this.symbolConflict();
    }

    throw this.nameConflict();
  }

  private codeConflict(): ConflictException {
    return new ConflictException({
      code: 'UNIT_CODE_EXISTS',
      message: 'A unit with this code already exists',
      fields: {
        code: ['Code must be unique.'],
      },
    });
  }

  private nameConflict(): ConflictException {
    return new ConflictException({
      code: 'UNIT_NAME_EXISTS',
      message: 'A unit with this name already exists',
      fields: {
        name: ['Name must be unique.'],
      },
    });
  }

  private symbolConflict(): ConflictException {
    return new ConflictException({
      code: 'UNIT_SYMBOL_EXISTS',
      message:
        'A unit with this symbol already exists',
      fields: {
        symbol: ['Symbol must be unique.'],
      },
    });
  }

  private orderBy(
    sort: string | undefined,
    order: 'asc' | 'desc',
  ) {
    switch (sort) {
      case undefined:
      case 'name':
        return { name: order };
      case 'code':
        return { code: order };
      case 'symbol':
        return { symbol: order };
      case 'createdAt':
        return { createdAt: order };
      case 'updatedAt':
        return { updatedAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for units',
          statusCode: HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private toUnit(unit: {
    id: string;
    code: string;
    name: string;
    symbol: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: unit.id,
      code: unit.code,
      name: unit.name,
      symbol: unit.symbol,
      active: unit.isActive,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'UNIT_NOT_FOUND',
      message: 'Unit was not found',
    });
  }
}
