import { Injectable } from '@nestjs/common';

import { AuditLogQueryDto } from '../audit/dto/audit-log-query.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { UserListQueryDto } from '../users/dto/user-list-query.dto.js';
import { UsersService } from '../users/users.service.js';
import {
  AdministrationAuditQueryDto,
  AdministrationRoleUpsertDto,
  AdministrationUserQueryDto,
  AdministrationUserUpsertDto,
} from './dto/administration.dto.js';

@Injectable()
export class AdministrationService {
  constructor(
    private readonly users: UsersService,
    private readonly access: AccessControlService,
    private readonly audit: AuditService,
  ) {}

  async listUsers(query: AdministrationUserQueryDto) {
    const backendQuery = new UserListQueryDto();
    backendQuery.page = query.page;
    backendQuery.pageSize = query.pageSize;
    backendQuery.search = query.search;
    backendQuery.sort = mapUserSort(query.sort);
    backendQuery.order = query.order;
    backendQuery.direction = query.direction;
    backendQuery.isActive = query.active;
    backendQuery.roleId = query.roleId;

    const response = await this.users.list(backendQuery);

    return {
      ...response,
      data: response.data.map((user) => mapUser(user)),
    };
  }

  async getUser(id: string) {
    return mapUser(await this.users.get(id));
  }

  async userFormOptions() {
    const roles = await this.access.listAllRoles();

    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
      })),
    };
  }

  async createUser(
    dto: AdministrationUserUpsertDto,
    actorUserId: string,
  ) {
    return mapUser(
      await this.users.createManaged(
        {
          name: dto.name,
          email: dto.email,
          roleIds: dto.roleIds,
        },
        actorUserId,
      ),
    );
  }

  async updateUser(
    id: string,
    dto: AdministrationUserUpsertDto,
    actorUserId: string,
  ) {
    return mapUser(
      await this.users.updateManaged(
        id,
        {
          name: dto.name,
          email: dto.email,
          roleIds: dto.roleIds,
        },
        actorUserId,
      ),
    );
  }

  async setUserStatus(
    id: string,
    active: boolean,
    actorUserId: string,
  ) {
    return mapUser(
      await this.users.setManagedStatus(
        id,
        active,
        actorUserId,
      ),
    );
  }

  async listRoles() {
    const roles = await this.access.listAllRoles();
    return roles.map((role) => mapRole(role));
  }

  async getRole(id: string) {
    return mapRole(await this.access.getRole(id));
  }

  async roleFormOptions() {
    const permissions = await this.access.listAllPermissions();
    const groups = new Map<
      string,
      Array<{
        key: string;
        label: string;
        description?: string;
      }>
    >();

    for (const permission of permissions) {
      const groupKey = permission.key.split('.')[0] ?? 'general';
      const group = groups.get(groupKey) ?? [];
      group.push({
        key: permission.key,
        label:
          permission.description ??
          humanize(permission.key),
        ...(permission.description
          ? {
              description:
                permission.description,
            }
          : {}),
      });
      groups.set(groupKey, group);
    }

    return {
      permissionGroups: Array.from(groups.entries()).map(
        ([name, permissions]) => ({
          name: humanize(name),
          permissions,
        }),
      ),
    };
  }

  async createRole(
    dto: AdministrationRoleUpsertDto,
    actorUserId: string,
  ) {
    return mapRole(
      await this.access.createManagedRole(
        {
          name: dto.name,
          description: dto.description,
          permissionKeys: dto.permissions,
        },
        actorUserId,
      ),
    );
  }

  async updateRole(
    id: string,
    dto: AdministrationRoleUpsertDto,
    actorUserId: string,
  ) {
    return mapRole(
      await this.access.updateManagedRole(
        id,
        {
          name: dto.name,
          description: dto.description,
          permissionKeys: dto.permissions,
        },
        actorUserId,
      ),
    );
  }

  async listAudit(query: AdministrationAuditQueryDto) {
    const backendQuery = new AuditLogQueryDto();
    backendQuery.page = query.page;
    backendQuery.pageSize = query.pageSize;
    backendQuery.search = query.search;
    backendQuery.sort =
      query.sort === 'occurredAt'
        ? 'createdAt'
        : query.sort;
    backendQuery.order = query.order;
    backendQuery.direction = query.direction;
    backendQuery.entityType = query.area;
    backendQuery.dateFrom = query.dateFrom;
    backendQuery.dateTo = query.dateTo;

    const response = await this.audit.list(backendQuery);

    return {
      ...response,
      data: response.data.map((entry) => ({
        id: entry.id,
        occurredAt: entry.createdAt,
        ...(entry.actor
          ? {
              actor: entry.actor,
            }
          : {}),
        action: entry.action,
        area: entry.entityType,
        entityType: entry.entityType,
        ...(entry.entityId
          ? {
              entityId: entry.entityId,
            }
          : {}),
        summary: humanize(entry.action),
      })),
    };
  }

  async auditOptions() {
    const options = await this.audit.options();

    return {
      areas: options.entityTypes,
    };
  }
}

function mapUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: readonly Array<{
    id: string;
    name: string;
  }>;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name:
      (user.firstName + ' ' + user.lastName).trim(),
    email: user.email,
    active: user.isActive,
    roles: user.roles.map((role) => ({
      id: role.id,
      name: role.name,
    })),
    ...(user.lastLoginAt
      ? {
          lastLoginAt:
            user.lastLoginAt,
        }
      : {}),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function mapRole(role: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: readonly Array<{
    key: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}) {
  const permissionKeys = role.permissions.map(
    (permission) => permission.key,
  );

  return {
    id: role.id,
    name: role.name,
    ...(role.description
      ? {
          description:
            role.description,
        }
      : {}),
    permissionCount:
      permissionKeys.length,
    userCount: role.userCount,
    builtIn: role.isSystem,
    updatedAt: role.updatedAt,
    permissions: permissionKeys,
    createdAt: role.createdAt,
  };
}

function mapUserSort(
  sort: string | undefined,
): string | undefined {
  switch (sort) {
    case undefined:
    case 'name':
      return 'firstName';
    case 'email':
    case 'createdAt':
    case 'updatedAt':
    case 'lastLoginAt':
      return sort;
    default:
      return sort;
  }
}

function humanize(value: string): string {
  const normalized = value
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();

  return normalized
    ? normalized[0].toUpperCase() +
        normalized.slice(1)
    : value;
}
