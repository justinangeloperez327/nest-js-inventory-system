import {
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ApiException } from '../../common/exceptions/api.exception.js';
import {
  toPaginatedResult,
  toPaginationWindow,
} from '../../common/utils/pagination.util.js';
import { prismaContainsSearch } from '../../common/utils/query-search.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SystemRole } from '../access-control/rbac.constants.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ResetUserPasswordDto } from './dto/reset-user-password.dto.js';
import type { SetUserRolesDto } from './dto/set-user-roles.dto.js';
import type { SetUserStatusDto } from './dto/set-user-status.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { UserListQueryDto } from './dto/user-list-query.dto.js';

const PENDING_CREDENTIAL_PREFIX = 'credential-provisioning-required:';

export interface ManagedUserUpsertInput {
  readonly name: string;
  readonly email: string;
  readonly roleIds: readonly string[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(query: UserListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search =
      prismaContainsSearch(
        query.search,
      );

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

    const orderBy = [
      this.userOrderBy(
        query.sort,
        query.resolvedOrder,
      ),
      { id: 'asc' as const },
    ];

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

  async create(
    dto: CreateUserDto,
    actorUserId: string,
  ) {
    await this.assertEmailAvailable(dto.email);
    await this.assertRolesExist(dto.roleIds);

    const passwordHash = await this.passwords.hash(dto.password);

    const user =
      await this.prisma.$transaction(
        async (tx) => {
          const created =
            await tx.user.create({
              data: {
                email: dto.email,
                passwordHash,
                firstName:
                  dto.firstName.trim(),
                lastName:
                  dto.lastName.trim(),
                roles: {
                  create:
                    dto.roleIds.map(
                      (roleId) => ({
                        roleId,
                      }),
                    ),
                },
              },
              include:
                this.userInclude(),
            });

          const safe =
            this.toUser(created);

          await this.audit.recordInTransaction(
            tx,
            {
              userId: actorUserId,
              action: 'user.created',
              entityType: 'user',
              entityId: created.id,
              after: safe,
            },
          );

          return created;
        },
      );

    return this.toUser(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorUserId: string,
  ) {
    const current = await this.requireUser(id);
    const before = await this.get(id);

    if (dto.email && dto.email !== current.email) {
      await this.assertEmailAvailable(dto.email, id);
    }

    const user =
      await this.prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.user.update({
              where: { id },
              data: {
                ...(dto.email !==
                undefined
                  ? {
                      email:
                        dto.email,
                    }
                  : {}),
                ...(dto.firstName !==
                undefined
                  ? {
                      firstName:
                        dto.firstName.trim(),
                    }
                  : {}),
                ...(dto.lastName !==
                undefined
                  ? {
                      lastName:
                        dto.lastName.trim(),
                    }
                  : {}),
              },
              include:
                this.userInclude(),
            });

          const after =
            this.toUser(updated);

          await this.audit.recordInTransaction(
            tx,
            {
              userId: actorUserId,
              action: 'user.updated',
              entityType: 'user',
              entityId: id,
              before,
              after,
            },
          );

          return updated;
        },
      );

    return this.toUser(user);
  }

  async setStatus(
    id: string,
    dto: SetUserStatusDto,
    actorUserId: string,
  ) {
    await this.requireUser(id);
    const before = await this.get(id);

    if (!dto.isActive) {
      await this.ensureAdministratorContinuity(id, false);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { isActive: dto.isActive },
        include: this.userInclude(),
      });

      let revokedSessionCount = 0;

      if (!dto.isActive) {
        const revoked =
          await tx.refreshToken.updateMany({
            where: {
              userId: id,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });
        revokedSessionCount =
          revoked.count;
      }

      const after =
        this.toUser(updated);

      await this.audit.recordInTransaction(
        tx,
        {
          userId: actorUserId,
          action:
            'user.status_changed',
          entityType: 'user',
          entityId: id,
          before,
          after: {
            ...after,
            revokedSessionCount,
          },
        },
      );

      return updated;
    });

    return this.toUser(user);
  }

  async setRoles(
    id: string,
    dto: SetUserRolesDto,
    actorUserId: string,
  ) {
    await this.requireUser(id);
    const before = await this.get(id);
    await this.assertRolesExist(dto.roleIds);
    await this.ensureAdministratorContinuity(id, undefined, dto.roleIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: dto.roleIds.map(
          (roleId) => ({
            userId: id,
            roleId,
          }),
        ),
      });

      await this.audit.recordInTransaction(
        tx,
        {
          userId: actorUserId,
          action:
            'user.roles_changed',
          entityType: 'user',
          entityId: id,
          before: {
            roleIds:
              before.roles.map(
                (role) => role.id,
              ),
          },
          after: {
            roleIds: dto.roleIds,
          },
        },
      );
    });

    return this.get(id);
  }

  async createManaged(
    dto: ManagedUserUpsertInput,
    actorUserId: string,
  ) {
    const email = dto.email.trim().toLowerCase();
    const name = splitDisplayName(dto.name);

    await this.assertEmailAvailable(email);
    await this.assertRolesExist([...dto.roleIds]);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash: PENDING_CREDENTIAL_PREFIX + randomUUID(),
          firstName: name.firstName,
          lastName: name.lastName,
          isActive: false,
          roles: {
            create: dto.roleIds.map((roleId) => ({ roleId })),
          },
        },
        include: this.userInclude(),
      });

      const safe = this.toUser(created);

      await this.audit.recordInTransaction(tx, {
        userId: actorUserId,
        action: 'user.created',
        entityType: 'user',
        entityId: created.id,
        after: {
          ...safe,
          credentialProvisioningRequired: true,
        },
      });

      return created;
    });

    return this.toUser(user);
  }

  async updateManaged(
    id: string,
    dto: ManagedUserUpsertInput,
    actorUserId: string,
  ) {
    const current = await this.requireUser(id);
    const before = await this.get(id);
    const email = dto.email.trim().toLowerCase();
    const name = splitDisplayName(dto.name);
    const roleIds = [...dto.roleIds];

    if (email !== current.email) {
      await this.assertEmailAvailable(email, id);
    }

    await this.assertRolesExist(roleIds);
    await this.ensureAdministratorContinuity(id, undefined, roleIds);

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          email,
          firstName: name.firstName,
          lastName: name.lastName,
        },
      });

      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({
          userId: id,
          roleId,
        })),
      });

      const updated = await tx.user.findUniqueOrThrow({
        where: { id },
        include: this.userInclude(),
      });
      const after = this.toUser(updated);

      await this.audit.recordInTransaction(tx, {
        userId: actorUserId,
        action: 'user.updated',
        entityType: 'user',
        entityId: id,
        before,
        after,
      });

      return updated;
    });

    return this.toUser(user);
  }

  async setManagedStatus(
    id: string,
    active: boolean,
    actorUserId: string,
  ) {
    if (active) {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { passwordHash: true },
      });

      if (!user) {
        throw this.notFound();
      }

      if (user.passwordHash.startsWith(PENDING_CREDENTIAL_PREFIX)) {
        throw new ConflictException({
          code: 'USER_CREDENTIALS_NOT_PROVISIONED',
          message:
            'Credentials must be provisioned by the authentication backend before this user can be activated',
        });
      }
    }

    return this.setStatus(
      id,
      { isActive: active },
      actorUserId,
    );
  }

  async resetPassword(
    id: string,
    dto: ResetUserPasswordDto,
    actorUserId: string,
  ) {
    await this.requireUser(id);
    const passwordHash = await this.passwords.hash(dto.password);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id },
          data: { passwordHash },
        });

        const revoked =
          await tx.refreshToken.updateMany({
            where: {
              userId: id,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });

        await this.audit.recordInTransaction(
          tx,
          {
            userId: actorUserId,
            action:
              'user.password_reset',
            entityType: 'user',
            entityId: id,
            after: {
              credentialReset: true,
              revokedSessionCount:
                revoked.count,
            },
          },
        );
      },
    );

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


function splitDisplayName(value: string): {
  firstName: string;
  lastName: string;
} {
  const normalized = value.trim().replace(/\s+/g, ' ');

  if (!normalized) {
    throw new ApiException({
      code: 'INVALID_USER_NAME',
      message: 'User name is required',
      statusCode: HttpStatus.BAD_REQUEST,
    });
  }

  const [firstName, ...rest] = normalized.split(' ');

  return {
    firstName,
    lastName: rest.join(' '),
  };
}
