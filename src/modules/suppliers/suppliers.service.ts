import {
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ApiException } from '../../common/exceptions/api.exception.js';
import {
  toPaginatedResult,
  toPaginationWindow,
} from '../../common/utils/pagination.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { SupplierListQueryDto } from './dto/supplier-list-query.dto.js';
import type { SupplierStatusDto } from './dto/supplier-status.dto.js';
import type { SupplierUpsertDto } from './dto/supplier-upsert.dto.js';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(query: SupplierListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();

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
                contactName: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                phone: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [suppliers, totalItems] =
      await this.prisma.$transaction([
        this.prisma.supplier.findMany({
          where,
          skip,
          take,
          orderBy: this.orderBy(
            query.sort,
            query.resolvedOrder,
          ),
        }),
        this.prisma.supplier.count({ where }),
      ]);

    return toPaginatedResult(
      suppliers.map((supplier) =>
        this.toSummary(supplier),
      ),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const supplier =
      await this.prisma.supplier.findUnique({
        where: { id },
      });

    if (!supplier) {
      throw this.notFound();
    }

    return this.toDetail(supplier);
  }

  async create(dto: SupplierUpsertDto) {
    await this.assertUnique(
      dto.code,
      dto.taxNumber,
    );

    try {
      const supplier =
        await this.prisma.supplier.create({
          data: this.toData(dto),
        });

      return this.toDetail(supplier);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: SupplierUpsertDto,
  ) {
    await this.requireSupplier(id);
    await this.assertUnique(
      dto.code,
      dto.taxNumber,
      id,
    );

    try {
      const supplier =
        await this.prisma.supplier.update({
          where: { id },
          data: this.toData(dto),
        });

      return this.toDetail(supplier);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async setStatus(
    id: string,
    dto: SupplierStatusDto,
  ) {
    await this.requireSupplier(id);

    const supplier =
      await this.prisma.supplier.update({
        where: { id },
        data: { isActive: dto.active },
      });

    return this.toDetail(supplier);
  }

  async purchaseHistory(
    id: string,
    query: PaginationQueryDto,
  ) {
    await this.requireSupplier(id);

    const page = toPaginatedResult(
      [],
      0,
      query,
    );

    return {
      ...page,
      currencyCode:
        this.config.get<string>(
          'app.currencyCode',
        ) ?? 'AED',
    };
  }

  private toData(dto: SupplierUpsertDto) {
    return {
      code: dto.code,
      name: dto.name,
      contactName: dto.contactName ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      taxNumber: dto.taxNumber ?? null,
      addressLine1: dto.addressLine1 ?? null,
      addressLine2: dto.addressLine2 ?? null,
      city: dto.city ?? null,
      stateProvince:
        dto.stateProvince ?? null,
      postalCode: dto.postalCode ?? null,
      countryCode: dto.countryCode ?? null,
    };
  }

  private async requireSupplier(id: string) {
    const supplier =
      await this.prisma.supplier.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!supplier) {
      throw this.notFound();
    }

    return supplier;
  }

  private async assertUnique(
    code: string,
    taxNumber?: string,
    excludeId?: string,
  ): Promise<void> {
    const existing =
      await this.prisma.supplier.findFirst({
        where: {
          OR: [
            {
              code: {
                equals: code,
                mode: 'insensitive',
              },
            },
            ...(taxNumber
              ? [
                  {
                    taxNumber: {
                      equals: taxNumber,
                      mode:
                        'insensitive' as const,
                    },
                  },
                ]
              : []),
          ],
          ...(excludeId
            ? { NOT: { id: excludeId } }
            : {}),
        },
        select: {
          code: true,
          taxNumber: true,
        },
      });

    if (!existing) {
      return;
    }

    if (
      existing.code.toLowerCase() ===
      code.toLowerCase()
    ) {
      throw this.codeConflict();
    }

    throw this.taxNumberConflict();
  }

  private rethrowUniqueConstraint(
    error: unknown,
  ): void {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      (error as { code?: unknown }).code !==
        'P2002'
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
        field
          .toLowerCase()
          .includes('tax_number'),
      )
    ) {
      throw this.taxNumberConflict();
    }

    throw this.codeConflict();
  }

  private codeConflict(): ConflictException {
    return new ConflictException({
      code: 'SUPPLIER_CODE_EXISTS',
      message:
        'A supplier with this code already exists',
      fields: {
        code: ['Code must be unique.'],
      },
    });
  }

  private taxNumberConflict():
    ConflictException {
    return new ConflictException({
      code: 'SUPPLIER_TAX_NUMBER_EXISTS',
      message:
        'A supplier with this tax number already exists',
      fields: {
        taxNumber: [
          'Tax number must be unique.',
        ],
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
      case 'contactName':
        return { contactName: order };
      case 'email':
        return { email: order };
      case 'countryCode':
        return { countryCode: order };
      case 'updatedAt':
        return { updatedAt: order };
      case 'createdAt':
        return { createdAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for suppliers',
          statusCode:
            HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private toSummary(supplier: {
    id: string;
    code: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    countryCode: string | null;
    isActive: boolean;
    updatedAt: Date;
  }) {
    return {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      ...(supplier.contactName
        ? {
            contactName:
              supplier.contactName,
          }
        : {}),
      ...(supplier.email
        ? { email: supplier.email }
        : {}),
      ...(supplier.phone
        ? { phone: supplier.phone }
        : {}),
      ...(supplier.countryCode
        ? {
            countryCode:
              supplier.countryCode,
          }
        : {}),
      active: supplier.isActive,
      updatedAt: supplier.updatedAt,
    };
  }

  private toDetail(supplier: {
    id: string;
    code: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    taxNumber: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    stateProvince: string | null;
    postalCode: string | null;
    countryCode: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...this.toSummary(supplier),
      ...(supplier.taxNumber
        ? {
            taxNumber:
              supplier.taxNumber,
          }
        : {}),
      ...(supplier.addressLine1
        ? {
            addressLine1:
              supplier.addressLine1,
          }
        : {}),
      ...(supplier.addressLine2
        ? {
            addressLine2:
              supplier.addressLine2,
          }
        : {}),
      ...(supplier.city
        ? { city: supplier.city }
        : {}),
      ...(supplier.stateProvince
        ? {
            stateProvince:
              supplier.stateProvince,
          }
        : {}),
      ...(supplier.postalCode
        ? {
            postalCode:
              supplier.postalCode,
          }
        : {}),
      createdAt: supplier.createdAt,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'SUPPLIER_NOT_FOUND',
      message: 'Supplier was not found',
    });
  }
}
