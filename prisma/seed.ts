import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  PERMISSION_DEFINITIONS,
  SYSTEM_ROLE_DEFINITIONS,
  SystemRole,
} from '../src/modules/access-control/rbac.constants.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seedSettings(): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'inventory.allowNegativeStock' },
    update: {},
    create: {
      key: 'inventory.allowNegativeStock',
      value: false,
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'inventory.defaultPageSize' },
    update: {},
    create: {
      key: 'inventory.defaultPageSize',
      value: 25,
    },
  });
}

async function seedAccessControl(): Promise<void> {
  for (const definition of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { key: definition.key },
      update: { description: definition.description },
      create: definition,
    });
  }

  const permissions = await prisma.permission.findMany({
    select: {
      id: true,
      key: true,
    },
  });

  const permissionIdByKey = new Map(
    permissions.map((permission) => [permission.key, permission.id]),
  );

  for (const definition of SYSTEM_ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { name: definition.name },
      update: {
        description: definition.description,
        isSystem: true,
      },
      create: {
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
    });

    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });

    const rolePermissions = definition.permissions.map((key) => {
      const permissionId = permissionIdByKey.get(key);

      if (!permissionId) {
        throw new Error(`Missing seeded permission: ${key}`);
      }

      return {
        roleId: role.id,
        permissionId,
      };
    });

    if (rolePermissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: rolePermissions,
      });
    }
  }
}

async function seedBootstrapAdministrator(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();

  if (!email) {
    return;
  }

  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!password || password.length < 12) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters when BOOTSTRAP_ADMIN_EMAIL is set',
    );
  }

  const administratorRole = await prisma.role.findUnique({
    where: { name: SystemRole.Administrator },
    select: { id: true },
  });

  if (!administratorRole) {
    throw new Error('Administrator role was not seeded');
  }

  let user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName:
          process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || 'System',
        lastName:
          process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || 'Administrator',
      },
      select: { id: true },
    });
  }

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: administratorRole.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: administratorRole.id,
    },
  });
}

async function main(): Promise<void> {
  await seedSettings();
  await seedAccessControl();
  await seedBootstrapAdministrator();
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
