import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ValidationError } from 'class-validator';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import request from 'supertest';

import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { requestContextMiddleware } from '../src/common/middleware/request-context.middleware.js';
import { validationErrorsToFields } from '../src/common/utils/validation-errors.util.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { HealthController } from '../src/health/health.controller.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AccessTokenGuard } from '../src/modules/auth/guards/access-token.guard.js';

describe('API HTTP contract (e2e)', () => {
  const prisma = {
    ping: jest.fn(),
  };
  const auth = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };
  const accessTokenGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, AuthController],
      providers: [
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AuthService,
          useValue: auth,
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue(accessTokenGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(requestContextMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        exceptionFactory: (errors: ValidationError[]) =>
          new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'The request contains invalid data.',
            fields: validationErrorsToFields(errors),
          }),
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    accessTokenGuard.canActivate.mockReturnValue(true);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves liveness and preserves a caller-supplied request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'group-25-health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
    });
    expect(response.headers['x-request-id']).toBe('group-25-health');
  });

  it('serves readiness when the database ping succeeds', async () => {
    prisma.ping.mockResolvedValue(undefined);

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('normalizes readiness failures into the public API error envelope', async () => {
    prisma.ping.mockRejectedValue(new Error('database offline'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .set('X-Request-Id', 'group-25-readiness')
      .expect(503);

    expect(response.body).toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database is unavailable',
      statusCode: 503,
      path: '/api/v1/health/ready',
      traceId: 'group-25-readiness',
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it('rejects invalid login requests before calling the auth service', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'not-an-email',
        password: '',
        unexpected: true,
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      path: '/api/v1/auth/login',
    });
    expect(response.body.errors.email).toBeDefined();
    expect(response.body.errors.password).toBeDefined();
    expect(response.body.errors.unexpected).toBeDefined();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('returns the authentication session for a valid login request', async () => {
    const session = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      expiresAt: '2026-10-06T15:00:00.000Z',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'admin@example.com',
        name: 'System Administrator',
        firstName: 'System',
        lastName: 'Administrator',
        roles: ['Administrator'],
        permissions: ['dashboard.view'],
      },
    };

    auth.login.mockResolvedValue(session);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: ' ADMIN@EXAMPLE.COM ',
        password: 'correct-password',
      })
      .expect(200);

    expect(auth.login).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'correct-password',
    });
    expect(response.body).toEqual(session);
  });
});
