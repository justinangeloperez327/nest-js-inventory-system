import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { AuthSession } from './interfaces/auth-session.interface.js';
import type { AuthUser } from './interfaces/auth-user.interface.js';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './interfaces/jwt-payload.interface.js';
import { PasswordService } from './password.service.js';

interface PreparedTokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: this.userAccessInclude(),
    });

    if (
      !user?.isActive ||
      !(await this.passwords.verify(user.passwordHash, dto.password))
    ) {
      throw this.invalidCredentials();
    }

    const tokens = await this.prepareTokenPair(user.id, user.email);

    await this.prisma.$transaction(
      async (tx) => {
        const loggedInAt = new Date();

        await tx.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: loggedInAt,
          },
        });

        await tx.refreshToken.create({
          data: {
            id: tokens.refreshTokenId,
            userId: user.id,
            tokenHash:
              tokens.refreshTokenHash,
            expiresAt:
              tokens.refreshExpiresAt,
          },
        });

        await this.audit.recordInTransaction(
          tx,
          {
            userId: user.id,
            action: 'auth.login',
            entityType: 'user',
            entityId: user.id,
            after: {
              email: user.email,
              loggedInAt,
            },
          },
        );
      },
    );

    return this.toSession(tokens, this.toAuthUser(user));
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const now = new Date();

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: {
        user: {
          include: this.userAccessInclude(),
        },
      },
    });

    if (
      !storedToken ||
      storedToken.userId !== payload.sub ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= now ||
      !storedToken.user.isActive ||
      !(await this.passwords.verify(storedToken.tokenHash, refreshToken))
    ) {
      throw this.invalidRefreshToken();
    }

    const tokens = await this.prepareTokenPair(
      storedToken.user.id,
      storedToken.user.email,
    );

    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          userId: storedToken.userId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          replacedByTokenId: tokens.refreshTokenId,
        },
      });

      if (revoked.count !== 1) {
        throw this.invalidRefreshToken();
      }

      await tx.refreshToken.create({
        data: {
          id: tokens.refreshTokenId,
          userId: storedToken.userId,
          tokenHash: tokens.refreshTokenHash,
          expiresAt: tokens.refreshExpiresAt,
        },
      });
    });

    return this.toSession(tokens, this.toAuthUser(storedToken.user));
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const loggedOutAt = new Date();
        const revoked =
          await tx.refreshToken.updateMany({
            where: {
              userId,
              revokedAt: null,
            },
            data: {
              revokedAt: loggedOutAt,
            },
          });

        await this.audit.recordInTransaction(
          tx,
          {
            userId,
            action: 'auth.logout',
            entityType: 'user',
            entityId: userId,
            after: {
              loggedOutAt,
              revokedSessionCount:
                revoked.count,
            },
          },
        );
      },
    );
  }

  private async prepareTokenPair(
    userId: string,
    email: string,
  ): Promise<PreparedTokenPair> {
    const accessTtlSeconds =
      this.config.getOrThrow<number>('auth.accessTtlSeconds');
    const refreshTtlSeconds =
      this.config.getOrThrow<number>('auth.refreshTtlSeconds');
    const issuer = this.config.getOrThrow<string>('auth.issuer');
    const audience = this.config.getOrThrow<string>('auth.audience');
    const accessSecret =
      this.config.getOrThrow<string>('auth.accessSecret');
    const refreshSecret =
      this.config.getOrThrow<string>('auth.refreshSecret');
    const refreshTokenId = randomUUID();

    const accessPayload: AccessTokenPayload = {
      sub: userId,
      email,
      type: 'access',
    };

    const refreshPayload = {
      sub: userId,
      type: 'refresh' as const,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: accessTtlSeconds,
        issuer,
        audience,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: refreshTtlSeconds,
        issuer,
        audience,
        jwtid: refreshTokenId,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      refreshTokenId,
      refreshTokenHash: await this.passwords.hash(refreshToken),
      refreshExpiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
    };
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('auth.refreshSecret'),
        issuer: this.config.getOrThrow<string>('auth.issuer'),
        audience: this.config.getOrThrow<string>('auth.audience'),
      });

      if (
        payload.type !== 'refresh' ||
        !payload.sub ||
        typeof payload.jti !== 'string' ||
        !payload.jti
      ) {
        throw this.invalidRefreshToken();
      }

      return payload;
    } catch {
      throw this.invalidRefreshToken();
    }
  }

  private toSession(
    tokens: PreparedTokenPair,
    user: AuthUser,
  ): AuthSession {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.getOrThrow<number>('auth.accessTtlSeconds'),
      expiresAt: new Date(
        Date.now() +
          this.config.getOrThrow<number>('auth.accessTtlSeconds') *
            1000,
      ).toISOString(),
      user,
    };
  }

  private toAuthUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: Array<{
      role: {
        name: string;
        permissions: Array<{
          permission: {
            key: string;
          };
        }>;
      };
    }>;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles.map(({ role }) => role.name),
      permissions: Array.from(
        new Set(
          user.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.key),
          ),
        ),
      ),
    };
  }

  private userAccessInclude() {
    return {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    } as const;
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect',
    });
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token is invalid or expired',
    });
  }
}
