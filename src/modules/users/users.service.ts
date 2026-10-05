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
import { SystemRole } from '../access-control/rbac.constants.js';
import { PasswordService } from '../auth/password.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ResetUserPasswordDto } from './dto/reset-user-password.dto.js';
import type { SetUserRolesDto } from './dto/set-user-roles.dto.js';
import type { SetUserStatusDto } from './dto/set-user-status.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { UserListQueryDto } from './dto/user-list-query.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: UserListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();

    const where = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.roleId
        ? { roles: { some: { roleId: query.roleId } } }
        : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              {
                firstName: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                lastName: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const orderBy = this.userOrderBy(query.sort, query.resolvedOrder);

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        include: this.userInclude(),
      }),
      this.prisma.user.count({ where }),
    ]);

    return toPaginatedResult(
      users.map((user) => this.toUser(user)),
      total,
      query,
    );
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: this.userInclude(),
    });

    if (!user) {
      throw this.notFound();
    }

    return this.toUser(user);
  }

  async create(dto: CreateUserDto) {
    await this.assertEmailAvailable(dto.email);
    await this.assertRolesExist(dto.roleIds);

    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        roles: {
          create: dto.roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: this.userInclude(),
    });

    return this.toUser(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    const current = await this.requireUser(id);

    if (dto.email && dto.email !== current.email) {
      await this.assertEmailAvailable(dto.email, id);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
      },
      include: this.userInclude(),
    });

    return this.toUser(user);
  }

  async setStatus(id: string, dto: SetUserStatusDto) {
    await this.requireUser(id);

    if (!dto.isActive) {
      await this.ensureAdministratorContinuity(id, false);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { isActive: dto.isActive },
        include: this.userInclude(),
      });

      if (!dto.isActive) {
        await tx.refreshToken.updateMany({
          where: {
            userId: id,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }

      return updated;
    });

    return this.toUser(user);
  }

  async setRoles(id: string, dto: SetUserRolesDto) {
    await this.requireUser(id);
    await this.assertRolesExist(dto.roleIds);
    await this.ensureAdministratorContinuity(id, undefined, dto.roleIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({
          userId: id,
          roleId,
        })),
      });
    });

    return this.get(id);
  }

  async resetPassword(id: string, dto: ResetUserPasswordDto) {
    await this.requireUser(id);
    const passwordHash = await this.passwords.hash(dto.password);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { passwordReset: true };
  }

  private async ensureAdministratorContinuity(
    userId: string,
    nextIsActive?: boolean,
    nextRoleIds?: string[],
  ): Promise<void> {
    const administratorRole = await this.prisma.role.findUnique({
      where: { name: SystemRole.Administrator },
      select: { id: true },
    });

    if (!administratorRole) {
      return;
    }

    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true,
        roles: {
          where: { roleId: administratorRole.id },
          select: { roleId: true },
        },
      },
    });

    if (!current?.isActive || current.roles.length === 0) {
      return;
    }

    const remainsActive = nextIsActive ?? current.isActive;
    const remainsAdministrator =
      nextRoleIds === undefined ||
      nextRoleIds.includes(administratorRole.id);

    if (remainsActive && remainsAdministrator) {
      return;
    }

    const otherActiveAdministrators = await this.prisma.user.count({
      where: {
        id: { not: userId },
        isActive: true,
        roles: {
          some: {
            roleId: administratorRole.id,
          },
        },
      },
    });

    if (otherActiveAdministrators === 0) {
      throw new ConflictException({
        code: 'LAST_ADMINISTRATOR_REQUIRED',
        message:
          'The last active Administrator cannot be deactivated or have the Administrator role removed',
      });
    }
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw this.notFound();
    }

    return user;
  }

  private async assertEmailAvailable(
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'USER_EMAIL_EXISTS',
        message: 'A user with this email already exists',
      });
    }
  }

  private async assertRolesExist(roleIds: string[]): Promise<void> {
    const count = await this.prisma.role.count({
      where: { id: { in: roleIds } },
    });

    if (count !== roleIds.length) {
      throw new ApiException({
        code: 'INVALID_ROLES',
        message: 'One or more role IDs are invalid',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
  }

  private userOrderBy(sort: string | undefined, order: 'asc' | 'desc') {
    switch (sort) {
      case undefined:
      case 'email':
        return { email: order };
      case 'firstName':
        return { firstName: order };
      case 'lastName':
        return { lastName: order };
      case 'createdAt':
        return { createdAt: order };
      case 'updatedAt':
        return { updatedAt: order };
      case 'lastLoginAt':
        return { lastLoginAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message: 'Unsupported sort field for users',
          statusCode: HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private userInclude() {
    return {
      roles: {
        include: {
          role: true,
        },
      },
    } as const;
  }

  private toUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{
      role: {
        id: string;
        name: string;
        description: string | null;
        isSystem: boolean;
      };
    }>;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      roles: user.roles
        .map(({ role }) => role)
        .sort((a, b) => a.name.localeCompare(b.name)),
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'USER_NOT_FOUND',
      message: 'User was not found',
    });
  }
}
