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
import { AuditService } from '../audit/audit.service.js';
import type { CustomerListQueryDto } from './dto/customer-list-query.dto.js';
import type { CustomerStatusDto } from './dto/customer-status.dto.js';
import type { CustomerUpsertDto } from './dto/customer-upsert.dto.js';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CustomerListQueryDto) {
    const { skip, take } =
      toPaginationWindow(query);
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

    const [customers, totalItems] =
      await this.prisma.$transaction([
        this.prisma.customer.findMany({
          where,
          skip,
          take,
          orderBy: this.orderBy(
            query.sort,
            query.resolvedOrder,
          ),
        }),
        this.prisma.customer.count({ where }),
      ]);

    return toPaginatedResult(
      customers.map((customer) =>
        this.toSummary(customer),
      ),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const customer =
      await this.prisma.customer.findUnique({
        where: { id },
      });

    if (!customer) {
      throw this.notFound();
    }

    return this.toDetail(customer);
  }

  async create(
    dto: CustomerUpsertDto,
    userId: string,
  ) {
    await this.assertUnique(
      dto.code,
      dto.taxNumber,
    );

    try {
      const customer =
        await this.prisma.$transaction(
          async (tx) => {
            const created =
              await tx.customer.create({
                data: this.toData(dto),
              });

            const after =
              this.toDetail(created);

            await this.audit.recordInTransaction(
              tx,
              {
                userId,
                action:
                  'customer.created',
                entityType:
                  'customer',
                entityId:
                  created.id,
                after,
              },
            );

            return created;
          },
        );

      return this.toDetail(customer);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: CustomerUpsertDto,
    userId: string,
  ) {
    await this.requireCustomer(id);
    const before = await this.get(id);
    await this.assertUnique(
      dto.code,
      dto.taxNumber,
      id,
    );

    try {
      const customer =
        await this.prisma.$transaction(
          async (tx) => {
            const updated =
              await tx.customer.update({
                where: { id },
                data: this.toData(dto),
              });

            const after =
              this.toDetail(updated);

            await this.audit.recordInTransaction(
              tx,
              {
                userId,
                action:
                  'customer.updated',
                entityType:
                  'customer',
                entityId: id,
                before,
                after,
              },
            );

            return updated;
          },
        );

      return this.toDetail(customer);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async setStatus(
    id: string,
    dto: CustomerStatusDto,
    userId: string,
  ) {
    await this.requireCustomer(id);
    const before = await this.get(id);

    const customer =
      await this.prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.customer.update({
              where: { id },
              data: {
                isActive:
                  dto.active,
              },
            });

          const after =
            this.toDetail(updated);

          await this.audit.recordInTransaction(
            tx,
            {
              userId,
              action:
                'customer.status_changed',
              entityType:
                'customer',
              entityId: id,
              before,
              after,
            },
          );

          return updated;
        },
      );

    return this.toDetail(customer);
  }

  private toData(dto: CustomerUpsertDto) {
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

  private async requireCustomer(id: string) {
    const customer =
      await this.prisma.customer.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!customer) {
      throw this.notFound();
    }

    return customer;
  }

  private async assertUnique(
    code: string,
    taxNumber?: string,
    excludeId?: string,
  ): Promise<void> {
    const existing =
      await this.prisma.customer.findFirst({
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
      code: 'CUSTOMER_CODE_EXISTS',
      message:
        'A customer with this code already exists',
      fields: {
        code: ['Code must be unique.'],
      },
    });
  }

  private taxNumberConflict():
    ConflictException {
    return new ConflictException({
      code: 'CUSTOMER_TAX_NUMBER_EXISTS',
      message:
        'A customer with this tax number already exists',
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
            'Unsupported sort field for customers',
          statusCode:
            HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private toSummary(customer: {
    id: string;
    code: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    isActive: boolean;
    updatedAt: Date;
  }) {
    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      ...(customer.contactName
        ? {
            contactName:
              customer.contactName,
          }
        : {}),
      ...(customer.email
        ? { email: customer.email }
        : {}),
      ...(customer.phone
        ? { phone: customer.phone }
        : {}),
      active: customer.isActive,
      updatedAt: customer.updatedAt,
    };
  }

  private toDetail(customer: {
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
      ...this.toSummary(customer),
      ...(customer.taxNumber
        ? {
            taxNumber: customer.taxNumber,
          }
        : {}),
      ...(customer.addressLine1
        ? {
            addressLine1:
              customer.addressLine1,
          }
        : {}),
      ...(customer.addressLine2
        ? {
            addressLine2:
              customer.addressLine2,
          }
        : {}),
      ...(customer.city
        ? { city: customer.city }
        : {}),
      ...(customer.stateProvince
        ? {
            stateProvince:
              customer.stateProvince,
          }
        : {}),
      ...(customer.postalCode
        ? {
            postalCode:
              customer.postalCode,
          }
        : {}),
      ...(customer.countryCode
        ? {
            countryCode:
              customer.countryCode,
          }
        : {}),
      createdAt: customer.createdAt,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'CUSTOMER_NOT_FOUND',
      message: 'Customer was not found',
    });
  }
}
