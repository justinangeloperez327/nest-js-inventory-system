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
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { SetRolePermissionsDto } from './dto/set-role-permissions.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

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

    const orderBy = this.roleOrderBy(query.sort, query.order);

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

  async createRole(dto: CreateRoleDto) {
    await this.assertRoleNameAvailable(dto.name);
    await this.assertPermissionsExist(dto.permissionIds);

    const role = await this.prisma.role.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        permissions: {
          create: dto.permissionIds.map((permissionId) => ({
            permissionId,
          })),
        },
      },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    return this.toRole(role);
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const current = await this.requireMutableRole(id);

    if (dto.name && dto.name.trim() !== current.name) {
      await this.assertRoleNameAvailable(dto.name, id);
    }

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
      },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    return this.toRole(role);
  }

  async setPermissions(id: string, dto: SetRolePermissionsDto) {
    await this.requireMutableRole(id);
    await this.assertPermissionsExist(dto.permissionIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId: id },
      });

      if (dto.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({
            roleId: id,
            permissionId,
          })),
        });
      }
    });

    return this.getRole(id);
  }

  async deleteRole(id: string): Promise<{ deleted: true }> {
    const role = await this.requireMutableRole(id);
    const assignments = await this.prisma.userRole.count({
      where: { roleId: role.id },
    });

    if (assignments > 0) {
      throw new ConflictException({
        code: 'ROLE_IN_USE',
        message: 'Role cannot be deleted while it is assigned to users',
      });
    }

    await this.prisma.role.delete({ where: { id } });

    return { deleted: true };
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
        ? { key: query.order }
        : query.sort === 'createdAt'
          ? { createdAt: query.order }
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
