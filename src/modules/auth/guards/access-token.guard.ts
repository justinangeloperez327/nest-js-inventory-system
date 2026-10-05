import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../../database/prisma.service.js';
import type { AuthRequest } from '../interfaces/auth-request.interface.js';
import type { AuthUser } from '../interfaces/auth-user.interface.js';
import type { AccessTokenPayload } from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw this.unauthorized('Authentication is required');
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('auth.accessSecret'),
        issuer: this.config.getOrThrow<string>('auth.issuer'),
        audience: this.config.getOrThrow<string>('auth.audience'),
      });
    } catch {
      throw this.unauthorized('Access token is invalid or expired');
    }

    if (payload.type !== 'access' || !payload.sub) {
      throw this.unauthorized('Access token is invalid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
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
      },
    });

    if (!user?.isActive) {
      throw this.unauthorized('User account is unavailable');
    }

    request.user = this.toAuthUser(user);

    return true;
  }

  private extractBearerToken(
    authorization: string | undefined,
  ): string | undefined {
    if (!authorization) {
      return undefined;
    }

    const [scheme, token] = authorization.trim().split(/\s+/, 2);

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }

    return token;
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

  private unauthorized(message: string): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message,
    });
  }
}
