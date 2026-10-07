import {
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ListQueryDto } from '../../common/dto/list-query.dto.js';
import { ApiException } from '../../common/exceptions/api.exception.js';
import {
  toPaginatedResult,
  toPaginationWindow,
} from '../../common/utils/pagination.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { SetRolePermissionsDto } from './dto/set-role-permissions.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';

export interface ManagedRoleUpsertInput {
  readonly name: string;
  readonly description?: string;
  readonly permissionKeys: readonly string[];
}

@Injectable()
export class AccessControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listRoles(query: ListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            {
              description: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};

    const orderBy = this.roleOrderBy(query.sort, query.resolvedOrder);

    const [roles, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          permissions: {
            include: { permission: true },
          },
          _count: {
            select: { users: true },
          },
        },
      }),
      this.prisma.role.count({ where }),
    ]);

    return toPaginatedResult(
      roles.map((role) => this.toRole(role)),
      total,
      query,
    );
  }

  async getRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role was not found',
      });
    }

    return this.toRole(role);
  }

  async createRole(
    dto: CreateRoleDto,
    actorUserId: string,
  ) {
    await this.assertRoleNameAvailable(dto.name);
    await this.assertPermissionsExist(dto.permissionIds);

    const role =
      await this.prisma.$transaction(
        async (tx) => {
          const created =
            await tx.role.create({
              data: {
                name: dto.name.trim(),
                description:
                  dto.description?.trim() ||
                  null,
                permissions: {
                  create:
                    dto.permissionIds.map(
                      (permissionId) => ({
                        permissionId,
                      }),
                    ),
                },
              },
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
                _count: {
                  select: {
                    users: true,
                  },
                },
              },
            });

          const safe =
            this.toRole(created);

          await this.audit.recordInTransaction(
            tx,
            {
              userId: actorUserId,
              action: 'role.created',
              entityType: 'role',
              entityId: created.id,
              after: safe,
            },
          );

          return created;
        },
      );

    return this.toRole(role);
  }

  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    actorUserId: string,
  ) {
    const current = await this.requireMutableRole(id);
    const before = await this.getRole(id);

    if (dto.name && dto.name.trim() !== current.name) {
      await this.assertRoleNameAvailable(dto.name, id);
    }

    const role =
      await this.prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.role.update({
              where: { id },
              data: {
                ...(dto.name !==
                undefined
                  ? {
                      name:
                        dto.name.trim(),
                    }
                  : {}),
                ...(dto.description !==
                undefined
                  ? {
                      description:
                        dto.description.trim() ||
                        null,
                    }
                  : {}),
              },
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
                _count: {
                  select: {
                    users: true,
                  },
                },
              },
            });

          const after =
            this.toRole(updated);

          await this.audit.recordInTransaction(
            tx,
            {
              userId: actorUserId,
              action: 'role.updated',
              entityType: 'role',
              entityId: id,
              before,
              after,
            },
          );

          return updated;
        },
      );

    return this.toRole(role);
  }

  async setPermissions(
    id: string,
    dto: SetRolePermissionsDto,
    actorUserId: string,
  ) {
    await this.requireMutableRole(id);
    const before = await this.getRole(id);
    await this.assertPermissionsExist(dto.permissionIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId: id },
      });

      if (dto.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map(
            (permissionId) => ({
              roleId: id,
              permissionId,
            }),
          ),
        });
      }

      await this.audit.recordInTransaction(
        tx,
        {
          userId: actorUserId,
          action:
            'role.permissions_changed',
          entityType: 'role',
          entityId: id,
          before: {
            permissionIds:
              before.permissions.map(
                (permission) =>
                  permission.id,
              ),
          },
          after: {
            permissionIds:
              dto.permissionIds,
          },
        },
      );
    });

    return this.getRole(id);
  }

  async deleteRole(
    id: string,
    actorUserId: string,
  ): Promise<{ deleted: true }> {
    const role = await this.requireMutableRole(id);
    const before = await this.getRole(id);
    const assignments = await this.prisma.userRole.count({
      where: { roleId: role.id },
    });

    if (assignments > 0) {
      throw new ConflictException({
        code: 'ROLE_IN_USE',
        message: 'Role cannot be deleted while it is assigned to users',
      });
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.role.delete({
          where: { id },
        });

        await this.audit.recordInTransaction(
          tx,
          {
            userId: actorUserId,
            action: 'role.deleted',
            entityType: 'role',
            entityId: id,
            before,
          },
        );
      },
    );

    return { deleted: true };
  }

  async listAllRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    return roles.map((role) => this.toRole(role));
  }

  async listAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ key: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        key: true,
        description: true,
      },
    });
  }

  async createManagedRole(
    dto: ManagedRoleUpsertInput,
    actorUserId: string,
  ) {
    const permissionIds = await this.resolvePermissionIds(
      dto.permissionKeys,
    );

    return this.createRole(
      {
        name: dto.name,
        description: dto.description,
        permissionIds,
      },
      actorUserId,
    );
  }

  async updateManagedRole(
    id: string,
    dto: ManagedRoleUpsertInput,
    actorUserId: string,
  ) {
    const current = await this.requireMutableRole(id);
    const before = await this.getRole(id);
    const permissionIds = await this.resolvePermissionIds(
      dto.permissionKeys,
    );

    if (dto.name.trim() !== current.name) {
      await this.assertRoleNameAvailable(dto.name, id);
    }

    const role = await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
        },
      });

      await tx.rolePermission.deleteMany({
        where: { roleId: id },
      });

      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: id,
            permissionId,
          })),
        });
      }

      const updated = await tx.role.findUniqueOrThrow({
        where: { id },
        include: {
          permissions: {
            include: { permission: true },
          },
          _count: {
            select: { users: true },
          },
        },
      });
      const after = this.toRole(updated);

      await this.audit.recordInTransaction(tx, {
        userId: actorUserId,
        action: 'role.updated',
        entityType: 'role',
        entityId: id,
        before,
        after,
      });

      return updated;
    });

    return this.toRole(role);
  }

  async listPermissions(query: ListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();

    const where = search
      ? {
          OR: [
            { key: { contains: search, mode: 'insensitive' as const } },
            {
              description: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};

    const orderBy =
      query.sort === undefined || query.sort === 'key'
        ? { key: query.resolvedOrder }
        : query.sort === 'createdAt'
          ? { createdAt: query.resolvedOrder }
          : this.invalidSort('permissions', query.sort);

    const [permissions, total] = await this.prisma.$transaction([
      this.prisma.permission.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.permission.count({ where }),
    ]);

    return toPaginatedResult(permissions, total, query);
  }

  private async resolvePermissionIds(
    keys: readonly string[],
  ): Promise<string[]> {
    const uniqueKeys = [...new Set(keys)];

    if (uniqueKeys.length === 0) {
      return [];
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: uniqueKeys } },
      select: { id: true, key: true },
    });

    if (permissions.length !== uniqueKeys.length) {
      throw new ApiException({
        code: 'INVALID_PERMISSIONS',
        message: 'One or more permission keys are invalid',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    const idByKey = new Map(
      permissions.map((permission) => [
        permission.key,
        permission.id,
      ]),
    );

    return uniqueKeys.map((key) => idByKey.get(key)!);
  }

  private async requireMutableRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role was not found',
      });
    }

    if (role.isSystem) {
      throw new ConflictException({
        code: 'SYSTEM_ROLE_IMMUTABLE',
        message:
          'System roles are managed by the application and cannot be modified',
      });
    }

    return role;
  }

  private async assertRoleNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.role.findFirst({
      where: {
        name: {
          equals: name.trim(),
          mode: 'insensitive',
        },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'ROLE_NAME_EXISTS',
        message: 'A role with this name already exists',
      });
    }
  }

  private async assertPermissionsExist(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const count = await this.prisma.permission.count({
      where: { id: { in: ids } },
    });

    if (count !== ids.length) {
      throw new ApiException({
        code: 'INVALID_PERMISSIONS',
        message: 'One or more permission IDs are invalid',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
  }

  private roleOrderBy(sort: string | undefined, order: 'asc' | 'desc') {
    switch (sort) {
      case undefined:
      case 'name':
        return { name: order };
      case 'createdAt':
        return { createdAt: order };
      case 'updatedAt':
        return { updatedAt: order };
      default:
        return this.invalidSort('roles', sort);
    }
  }

  private invalidSort(resource: string, sort: string): never {
    throw new ApiException({
      code: 'INVALID_SORT_FIELD',
      message: `Unsupported sort field for ${resource}`,
      statusCode: HttpStatus.BAD_REQUEST,
      details: { sort },
    });
  }

  private toRole(role: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
    permissions: Array<{
      permission: {
        id: string;
        key: string;
        description: string | null;
      };
    }>;
    _count: { users: number };
  }) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissions: role.permissions
        .map(({ permission }) => permission)
        .sort((a, b) => a.key.localeCompare(b.key)),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
