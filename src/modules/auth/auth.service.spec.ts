import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
} from '@nestjs/common';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Permission } from '../access-control/rbac.constants.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';

describe('AuthService', () => {
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@example.com',
    firstName: 'System',
    lastName: 'Administrator',
    passwordHash: 'password-hash',
    isActive: true,
    roles: [
      {
        role: {
          name: 'Administrator',
          permissions: [
            {
              permission: {
                key: Permission.DashboardView,
              },
            },
            {
              permission: {
                key: Permission.DashboardView,
              },
            },
            {
              permission: {
                key: Permission.InventoryRead,
              },
            },
          ],
        },
      },
    ],
  };

  const tx = {
    user: {
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const jwt = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const passwords = {
    verify: jest.fn(),
    hash: jest.fn(),
  };

  const audit = {
    recordInTransaction: jest.fn(),
  };

  const settings: Record<string, unknown> = {
    'auth.accessTtlSeconds': 900,
    'auth.refreshTtlSeconds': 604800,
    'auth.issuer': 'nest-js-inventory-system',
    'auth.audience': 'angular-inventory-system',
    'auth.accessSecret': 'access-secret',
    'auth.refreshSecret': 'refresh-secret',
  };

  const config = {
    getOrThrow: jest.fn((key: string) => settings[key]),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
    );
    tx.user.update.mockResolvedValue(user);
    tx.refreshToken.create.mockResolvedValue({});
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    passwords.hash.mockResolvedValue('refresh-token-hash');

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      passwords as unknown as PasswordService,
      audit as unknown as AuditService,
    );
  });

  it('logs in an active user, persists the refresh session, and audits the event', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);
    jwt.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const session = await service.login({
      email: user.email,
      password: 'correct-password',
    });

    expect(session.accessToken).toBe('access-token');
    expect(session.refreshToken).toBe('refresh-token');
    expect(session.user.roles).toEqual(['Administrator']);
    expect(session.user.permissions).toEqual([
      Permission.DashboardView,
      Permission.InventoryRead,
    ]);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        lastLoginAt: expect.any(Date),
      },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        tokenHash: 'refresh-token-hash',
        expiresAt: expect.any(Date),
      }),
    });
    expect(audit.recordInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
      }),
    );
  });

  it('does not create a session when the password is invalid', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({
        email: user.email,
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh token atomically', async () => {
    const storedToken = {
      id: 'refresh-token-id',
      userId: user.id,
      tokenHash: 'stored-refresh-hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    };

    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      type: 'refresh',
      jti: storedToken.id,
    });
    prisma.refreshToken.findUnique.mockResolvedValue(storedToken);
    passwords.verify.mockResolvedValue(true);
    jwt.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');

    const session = await service.refresh('old-refresh-token');

    expect(session.accessToken).toBe('new-access-token');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: storedToken.id,
        userId: user.id,
        revokedAt: null,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        revokedAt: expect.any(Date),
        replacedByTokenId: expect.any(String),
      },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        tokenHash: 'refresh-token-hash',
      }),
    });
  });

  it('revokes all active refresh sessions on logout and audits the action', async () => {
    tx.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    await service.logout(user.id);

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
    expect(audit.recordInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'auth.logout',
        entityId: user.id,
        after: expect.objectContaining({
          revokedSessionCount: 2,
        }),
      }),
    );
  });
});
