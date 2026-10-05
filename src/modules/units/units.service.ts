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
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateUnitDto } from './dto/create-unit.dto.js';
import type { SetUnitStatusDto } from './dto/set-unit-status.dto.js';
import type { UnitListQueryDto } from './dto/unit-list-query.dto.js';
import type { UpdateUnitDto } from './dto/update-unit.dto.js';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: UnitListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();

    const where = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { symbol: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const orderBy = this.orderBy(query.sort, query.resolvedOrder);

    const [units, total] = await this.prisma.$transaction([
      this.prisma.unit.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          _count: {
            select: { products: true },
          },
        },
      }),
      this.prisma.unit.count({ where }),
    ]);

    return toPaginatedResult(
      units.map((unit) => this.toUnit(unit)),
      total,
      query,
    );
  }

  async get(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!unit) {
      throw this.notFound();
    }

    return this.toUnit(unit);
  }

  async create(dto: CreateUnitDto) {
    await this.assertUnique(dto.name, dto.symbol);

    const unit = await this.prisma.unit.create({
      data: {
        name: dto.name,
        symbol: dto.symbol,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return this.toUnit(unit);
  }

  async update(id: string, dto: UpdateUnitDto) {
    const current = await this.requireUnit(id);

    const nextName = dto.name ?? current.name;
    const nextSymbol = dto.symbol ?? current.symbol;

    if (
      nextName.toLocaleLowerCase() !== current.name.toLocaleLowerCase() ||
      nextSymbol.toLocaleLowerCase() !== current.symbol.toLocaleLowerCase()
    ) {
      await this.assertUnique(nextName, nextSymbol, id);
    }

    const unit = await this.prisma.unit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.symbol !== undefined ? { symbol: dto.symbol } : {}),
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return this.toUnit(unit);
  }

  async setStatus(id: string, dto: SetUnitStatusDto) {
    await this.requireUnit(id);

    const unit = await this.prisma.unit.update({
      where: { id },
      data: { isActive: dto.isActive },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return this.toUnit(unit);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.requireUnit(id);

    const productCount = await this.prisma.product.count({
      where: { unitId: id },
    });

    if (productCount > 0) {
      throw new ConflictException({
        code: 'UNIT_IN_USE',
        message:
          'Unit cannot be deleted while products reference it; deactivate it instead',
      });
    }

    await this.prisma.unit.delete({ where: { id } });

    return { deleted: true };
  }

  private async requireUnit(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        symbol: true,
      },
    });

    if (!unit) {
      throw this.notFound();
    }

    return unit;
  }

  private async assertUnique(
    name: string,
    symbol: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.unit.findFirst({
      where: {
        OR: [
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
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: {
        id: true,
        name: true,
        symbol: true,
      },
    });

    if (!existing) {
      return;
    }

    const nameConflict =
      existing.name.toLocaleLowerCase() === name.toLocaleLowerCase();

    throw new ConflictException({
      code: nameConflict ? 'UNIT_NAME_EXISTS' : 'UNIT_SYMBOL_EXISTS',
      message: nameConflict
        ? 'A unit with this name already exists'
        : 'A unit with this symbol already exists',
    });
  }

  private orderBy(sort: string | undefined, order: 'asc' | 'desc') {
    switch (sort) {
      case undefined:
      case 'name':
        return { name: order };
      case 'symbol':
        return { symbol: order };
      case 'createdAt':
        return { createdAt: order };
      case 'updatedAt':
        return { updatedAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message: 'Unsupported sort field for units',
          statusCode: HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private toUnit(unit: {
    id: string;
    name: string;
    symbol: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: { products: number };
  }) {
    return {
      id: unit.id,
      name: unit.name,
      symbol: unit.symbol,
      isActive: unit.isActive,
      productCount: unit._count.products,
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
