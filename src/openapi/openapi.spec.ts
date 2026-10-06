import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import { PrismaService } from '../database/prisma.service.js';
import { HealthController } from '../health/health.controller.js';
import { setupOpenApi } from './openapi.js';

describe('OpenAPI contract', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('publishes the standard error schema and leaves health endpoints public', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            ping: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');

    const document = setupOpenApi(app, {
      appName: 'Inventory System',
      apiPrefix: 'api/v1',
      path: 'docs',
      version: '1.0.0',
    });

    const healthPath = Object.keys(document.paths).find((path) =>
      path.endsWith('/health'),
    );
    const readyPath = Object.keys(document.paths).find((path) =>
      path.endsWith('/health/ready'),
    );

    expect(document.components?.schemas?.ApiErrorResponse).toBeDefined();
    expect(document.components?.responses?.Unauthorized).toBeDefined();
    expect(healthPath).toBeDefined();
    expect(readyPath).toBeDefined();
    expect(document.paths[healthPath!]?.get?.security).toEqual([]);
    expect(
      document.paths[readyPath!]?.get?.responses?.['503'],
    ).toEqual({
      $ref: '#/components/responses/ServiceUnavailable',
    });
  });
});
